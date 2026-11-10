// Captation : webcam -> flux optique (Lucas-Kanade) sur grille 64x36, ou simulation.
// Les images restent en mémoire le temps du calcul : rien n'est enregistré ni envoyé.
import { GW, GH, GN, state, settings, clamp } from './state.js';

const PW = GW * 2, PH = GH * 2, PN = PW * PH;   // résolution d'analyse 128x72
const video = document.createElement('video');
video.muted = true; video.playsInline = true;
const cvs = document.createElement('canvas');
cvs.width = PW; cvs.height = PH;
const ctx = cvs.getContext('2d', { willReadFrequently: true });

let cur = new Float32Array(PN), prev = new Float32Array(PN);
const raw = new Float32Array(PN), ix = new Float32Array(PN), iy = new Float32Array(PN), it = new Float32Array(PN);
const noise = new Float32Array(GN);
let stream = null, lastVT = -1, hasPrev = false, calibT = 0;

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
}

export function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (state.capture.mode === 'camera') state.capture.mode = 'off';
}

export async function startCamera(deviceId) {
  stopCamera();
  state.capture.error = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    state.capture.error = 'Caméra non disponible dans ce navigateur';
    throw new Error(state.capture.error);
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 },
      },
    });
  } catch (e) {
    state.capture.error = e.name === 'NotAllowedError' ? 'Accès à la caméra refusé' : 'Caméra introuvable';
    throw e;
  }
  video.srcObject = stream;
  await video.play();
  state.capture.mode = 'camera';
  recalibrate();
}

export function recalibrate() {
  calibT = 10; hasPrev = false; noise.fill(0.02);
}

function processFrame(dtV) {
  ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -PW, 0, PW, PH); ctx.restore();  // effet miroir
  const d = ctx.getImageData(0, 0, PW, PH).data;
  for (let i = 0, j = 0; i < PN; i++, j += 4) raw[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  const t = prev; prev = cur; cur = t;
  // Flou 3x3 pour réduire le bruit du capteur.
  for (let y = 1; y < PH - 1; y++) {
    for (let x = 1; x < PW - 1; x++) {
      const i = y * PW + x;
      cur[i] = (raw[i - PW - 1] + raw[i - PW] + raw[i - PW + 1] + raw[i - 1] + raw[i] + raw[i + 1]
        + raw[i + PW - 1] + raw[i + PW] + raw[i + PW + 1]) / 9;
    }
  }
  if (!hasPrev) { hasPrev = true; return; }

  // Compensation des variations globales de lumière (auto-exposition, éclairage scénique).
  let md = 0;
  for (let i = 0; i < PN; i++) md += cur[i] - prev[i];
  md /= PN;
  for (let y = 1; y < PH - 1; y++) {
    for (let x = 1; x < PW - 1; x++) {
      const i = y * PW + x;
      ix[i] = (cur[i + 1] - cur[i - 1] + prev[i + 1] - prev[i - 1]) * 0.25;
      iy[i] = (cur[i + PW] - cur[i - PW] + prev[i + PW] - prev[i - PW]) * 0.25;
      it[i] = cur[i] - prev[i] - md;
    }
  }

  const calibrating = calibT > 0;
  const F = state.flow, sens = settings.sensitivity;
  for (let gy = 0; gy < GH; gy++) {
    const y0 = Math.max(1, gy * 2 - 2), y1 = Math.min(PH - 2, gy * 2 + 3);
    for (let gx = 0; gx < GW; gx++) {
      const x0 = Math.max(1, gx * 2 - 2), x1 = Math.min(PW - 2, gx * 2 + 3);
      let sxx = 0, sxy = 0, syy = 0, sxt = 0, syt = 0, sd = 0, n = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * PW + x, a = ix[i], b = iy[i], c = it[i];
          sxx += a * a; sxy += a * b; syy += b * b; sxt += a * c; syt += b * c;
          sd += c < 0 ? -c : c; n++;
        }
      }
      const g = gy * GW + gx;
      const diff = sd / n / 255;
      const thr = noise[g] * 2.5 + 0.006;
      // Plancher de bruit : appris vite pendant la calibration, puis suivi très lentement.
      if (calibrating) noise[g] += (diff - noise[g]) * 0.08;
      else if (diff < thr) noise[g] += (diff - noise[g]) * 0.01;
      else noise[g] += (diff - noise[g]) * 0.00005;

      const a = clamp((diff - thr) * 22 * sens);
      let u = 0, v = 0;
      if (a > 0.02) {
        const det = sxx * syy - sxy * sxy, tr = sxx + syy;
        const minEig = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) * 0.5;
        if (minEig > 60) {
          u = (-syy * sxt + sxy * syt) / det;
          v = (sxy * sxt - sxx * syt) / det;
          const mag = Math.hypot(u, v);
          if (mag > 3) { u *= 3 / mag; v *= 3 / mag; }
          const k = 0.5 / dtV;          // pixels d'analyse par image -> cellules par seconde
          u *= k; v *= k;
        }
      }
      F.act[g] += (a - F.act[g]) * 0.5;
      F.x[g] += (u - F.x[g]) * 0.5;
      F.y[g] += (v - F.y[g]) * 0.5;
    }
  }
}

// ---------- Simulation (test sans foule) ----------
const dancers = Array.from({ length: 28 }, (_, i) => ({
  x: 6 + (i % 7) * 8.6 + Math.random() * 2, y: 9 + Math.floor(i / 7) * 6.5 + Math.random() * 2,
  ph: Math.random() * 6.283, f: 0.6 + Math.random(), an: Math.random() * 6.283,
}));
const mouse = { x: 0.5, y: 0.5, vx: 0, vy: 0, t: 0 };
let jumpT = 0;

window.addEventListener('pointermove', (e) => {
  const now = performance.now() / 1000, dt = Math.max(0.004, now - mouse.t);
  const x = e.clientX / innerWidth, y = e.clientY / innerHeight;
  if (dt < 0.2) {
    mouse.vx += ((x - mouse.x) / dt * GW - mouse.vx) * 0.4;
    mouse.vy += ((y - mouse.y) / dt * GH - mouse.vy) * 0.4;
  }
  mouse.x = x; mouse.y = y; mouse.t = now;
});

export function simJump() { jumpT = 0.3; }

function splat(cx, cy, vx, vy, r) {
  const F = state.flow, a = clamp(Math.hypot(vx, vy) / 10);
  if (a < 0.01) return;
  const x0 = Math.max(0, Math.floor(cx - r * 2)), x1 = Math.min(GW - 1, Math.ceil(cx + r * 2));
  const y0 = Math.max(0, Math.floor(cy - r * 2)), y1 = Math.min(GH - 1, Math.ceil(cy + r * 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r));
      if (w < 0.05) continue;
      const g = y * GW + x;
      F.x[g] += vx * w; F.y[g] += vy * w;
      F.act[g] = Math.min(1, F.act[g] + a * w);
    }
  }
}

function simulate(dt, t) {
  const F = state.flow, p = settings.simPreset;
  F.x.fill(0); F.y.fill(0); F.act.fill(0);
  jumpT = Math.max(0, jumpT - dt);
  for (const d of dancers) {
    let vx = 0, vy = 0;
    if (p === 1) {                                   // calme
      vx = 0.7 * Math.sin(t * 0.7 + d.ph); vy = 0.5 * Math.cos(t * 0.5 + d.ph);
    } else if (p === 2) {                            // dispersée : chacun pour soi
      const s = 8 * Math.cos(t * 6.283 * d.f + d.ph);
      vx = Math.cos(d.an) * s; vy = Math.sin(d.an) * s;
    } else if (p === 3) {                            // synchronisée : balancement à 112 BPM
      vx = 11 * Math.cos(t * 6.283 * 112 / 120); vy = 1.5 * Math.sin(t * 3 + d.ph);
    } else if (p === 4) {                            // frénésie : sauts ensemble à 128 BPM
      vy = 17 * Math.cos(t * 6.283 * 128 / 120); vx = 3 * Math.sin(t * 5 + d.ph);
    }
    if (jumpT > 0) vy -= 30;
    if (p !== 5) splat(d.x + vx * 0.05, d.y + vy * 0.05, vx, vy, 3.2);
  }
  if (p === 5 && settings.sectors.length) {          // tournée : la foule passe d'un secteur à l'autre toutes les 6 s
    const S = settings.sectors, s = S[settings.simSector >= 0 ? settings.simSector % S.length : Math.floor(t / 6) % S.length];
    const r = clamp(Math.min(s.w, s.h) / 5, 1.2, 3.2);
    dancers.forEach((d, i) => {
      const vx = 11 * Math.cos(t * 6.283 * 112 / 120), vy = 4 * Math.sin(t * 3 + d.ph) - (jumpT > 0 ? 30 : 0);
      const mx = Math.min(r * 1.8, s.w / 2 - 0.5), my = Math.min(r * 1.8, s.h / 2 - 0.5);   // reste à l'intérieur du secteur
      splat(s.x + mx + (i % 7) / 6 * (s.w - 2 * mx) + vx * 0.02, s.y + my + Math.floor(i / 7) / 3 * (s.h - 2 * my) + vy * 0.02, vx, vy, r);
    });
  }
  const k = Math.exp(-dt * 8);
  mouse.vx *= k; mouse.vy *= k;
  const mv = Math.hypot(mouse.vx, mouse.vy), lim = mv > 40 ? 40 / mv : 1;
  splat(mouse.x * GW, mouse.y * GH, mouse.vx * lim, mouse.vy * lim, 5);
}

export function update(dt, t) {
  const c = state.capture;
  if (settings.simulate) { c.calibLeft = 0; simulate(dt, t); return; }
  if (c.mode !== 'camera') {
    const F = state.flow; F.x.fill(0); F.y.fill(0); F.act.fill(0);
    return;
  }
  if (video.readyState < 2) return;
  const vt = video.currentTime;
  if (vt === lastVT) return;
  const dtV = clamp(vt - lastVT, 1 / 60, 0.2);
  lastVT = vt;
  if (calibT > 0) calibT = Math.max(0, calibT - dtV);
  c.calibLeft = calibT;
  processFrame(dtV);
}
