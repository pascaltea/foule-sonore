// Mode « petit groupe » : suivi du corps de 1 à 5 personnes (MediaPipe Pose), ou silhouettes simulées.
// Chaque personne suivie occupe un emplacement stable (0..4) auquel la régie associe un instrument.
// Les images sont analysées sur place : rien n'est enregistré ni envoyé.
import { GW, GH, MAX_PLAYERS, state, settings, clamp, smooth, rebuildSectorMap } from './state.js';
import { video, splat, simJumping } from './capture.js';

const VER = '0.10.14', CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const ASPECT = 16 / 9, NJ = 33;
// Articulations : 0 nez, 11/12 épaules, 13/14 coudes, 15/16 poignets, 23/24 hanches, 25/26 genoux, 27/28 chevilles.
const MOVERS = [[0, 0.6], [13, 0.8], [14, 0.8], [15, 1.4], [16, 1.4], [25, 0.8], [26, 0.8], [27, 1.2], [28, 1.2]];
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

export const status = { ready: false, loading: false, error: '' };
export const slots = Array.from({ length: MAX_PLAYERS }, () => ({
  on: false, fresh: true, lost: 0, cx: 0, cy: 0, torso: 0.15,
  px: new Float32Array(NJ), py: new Float32Array(NJ), vx: new Float32Array(NJ), vy: new Float32Array(NJ), vis: new Float32Array(NJ),
  tE: 0, tS: 0, tC: 0, tCy: 0.5, jumpAge: 9,
}));
let landmarker = null, loading = null, lastVT = -1;

// Charge la bibliothèque et le modèle (quelques Mo, mis en cache par le navigateur ensuite).
export function load() {
  if (!loading) {
    status.loading = true; status.error = '';
    loading = (async () => {
      const { PoseLandmarker, FilesetResolver } = await import(`${CDN}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const opt = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: MAX_PLAYERS,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { landmarker = await PoseLandmarker.createFromOptions(files, opt('GPU')); }
      catch { landmarker = await PoseLandmarker.createFromOptions(files, opt('CPU')); }
      status.ready = true; status.loading = false;
    })().catch((e) => { status.loading = false; status.error = 'Suivi du corps indisponible (connexion Internet requise au premier lancement)'; loading = null; throw e; });
  }
  return loading;
}

const mid = (p, a, b, k) => (p[a][k] + p[b][k]) / 2;

// Reçoit les poses d'une image (points normalisés 0..1, déjà en miroir) et les rattache aux emplacements.
function ingest(poses, dt) {
  const cs = poses.map((p) => ({ p, x: (mid(p, 11, 12, 'x') + mid(p, 23, 24, 'x')) / 2, y: (mid(p, 11, 12, 'y') + mid(p, 23, 24, 'y')) / 2, slot: -1 }));
  // Appariement glouton par proximité : une personne garde son emplacement tant qu'elle reste suivie.
  const pairs = [];
  slots.forEach((s, i) => { if (s.on) cs.forEach((c, j) => { const d = Math.hypot((c.x - s.cx) * ASPECT, c.y - s.cy); if (d < 0.35) pairs.push([d, i, j]); }); });
  pairs.sort((a, b) => a[0] - b[0]);
  const taken = new Set();
  for (const [, i, j] of pairs) { if (taken.has(i) || cs[j].slot >= 0) continue; cs[j].slot = i; taken.add(i); }
  for (const c of cs) {
    if (c.slot >= 0) continue;
    const i = slots.findIndex((s, k) => !s.on && !taken.has(k));
    if (i < 0) continue;
    c.slot = i; taken.add(i); slots[i].on = true; slots[i].fresh = true;
  }
  slots.forEach((s, i) => {
    if (taken.has(i)) return;
    s.lost += dt;
    if (s.on && s.lost > 0.6) { s.on = false; s.tE = s.tS = s.tC = 0; }
  });
  for (const c of cs) if (c.slot >= 0) track(slots[c.slot], c, dt);
}

function track(s, c, dt) {
  const p = c.p;
  for (let k = 0; k < NJ; k++) {
    const x = p[k].x, y = p[k].y;
    if (s.fresh) { s.px[k] = x; s.py[k] = y; s.vx[k] = s.vy[k] = 0; }
    else {
      const nx = s.px[k] + (x - s.px[k]) * 0.6, ny = s.py[k] + (y - s.py[k]) * 0.6;
      s.vx[k] += ((nx - s.px[k]) / dt - s.vx[k]) * 0.5; s.vy[k] += ((ny - s.py[k]) / dt - s.vy[k]) * 0.5;
      s.px[k] = nx; s.py[k] = ny;
    }
    s.vis[k] = p[k].visibility ?? 1;
  }
  s.fresh = false; s.lost = 0; s.cx = c.x; s.cy = c.y;
  const shx = (s.px[11] + s.px[12]) / 2, shy = (s.py[11] + s.py[12]) / 2, hx = (s.px[23] + s.px[24]) / 2, hy = (s.py[23] + s.py[24]) / 2;
  // Longueur du torse = unité de mesure : les gestes comptent pareil de près comme de loin.
  s.torso += (Math.max(0.04, Math.hypot((shx - hx) * ASPECT, shy - hy)) - s.torso) * 0.2;
  const sp = (k) => (s.vis[k] < 0.4 ? 0 : Math.hypot(s.vx[k] * ASPECT, s.vy[k]) / s.torso);
  let sum = 0, w = 0;
  for (const [k, wk] of MOVERS) { sum += sp(k) * wk; w += wk; }
  const hl = sp(15), hr = sp(16), limbs = Math.max(hl, hr, sp(27), sp(28));
  s.tE = clamp(Math.sqrt(sum / w / 3));                // énergie : ampleur moyenne des gestes (courbe douce : un geste lent joue déjà)
  s.tS = clamp(limbs / 6);                             // vitesse : le membre le plus rapide
  s.tC = hl + hr > 0.4 ? clamp(1 - Math.abs(hl - hr) / (hl + hr)) : 0.5;   // régularité : les deux mains ensemble
  // Hauteur des mains : aux hanches = grave, au-dessus de la tête = aigu.
  const hands = s.vis[15] >= 0.4 || s.vis[16] >= 0.4;
  if (hands) s.tCy = clamp(((s.py[15] + s.py[16]) / 2 - (shy - s.torso)) / (2 * s.torso));
  // Saut : les hanches montent vite.
  s.jumpAge += dt;
  s.jump = (s.vy[23] + s.vy[24]) / 2 / s.torso < -1.8 && s.jumpAge > 0.8;
  if (s.jump) s.jumpAge = 0;
}

// ---------- Silhouettes simulées (test sans caméra) ----------
const mouse = { x: 0.5, y: 0.4 };
window.addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; });

function figure(cx, top, T, aL, aR, hand) {
  const p = Array.from({ length: NJ }, () => ({ x: cx, y: top - 0.55 * T, visibility: 1 }));
  const set = (k, dx, dy) => { p[k].x = cx + dx * T / ASPECT; p[k].y = top + dy * T; };
  set(11, -0.45, 0); set(12, 0.45, 0); set(23, -0.3, 1); set(24, 0.3, 1);
  set(25, -0.3, 1.9); set(26, 0.3, 1.9); set(27, -0.3, 2.8); set(28, 0.3, 2.8);
  // Angle du bras depuis la verticale basse : 0 = le long du corps, pi = levé.
  set(13, -0.45 - 0.6 * Math.sin(aL), 0.6 * Math.cos(aL)); set(15, -0.45 - 1.2 * Math.sin(aL), 1.2 * Math.cos(aL));
  set(14, 0.45 + 0.6 * Math.sin(aR), 0.6 * Math.cos(aR)); set(16, 0.45 + 1.2 * Math.sin(aR), 1.2 * Math.cos(aR));
  if (hand) { p[16].x = hand.x; p[16].y = hand.y; p[14].x = (p[12].x + hand.x) / 2; p[14].y = (p[12].y + hand.y) / 2; }
  return p;
}

function simPoses(t) {
  const p = settings.simPreset, T = 0.17, top = 0.36, out = [], jump = simJumping() ? -0.6 * T : 0;
  const n = [1, 1, 2, 3, 5, 5][p] ?? 1, tw = 6.283;
  const turn = settings.simSector >= 0 ? settings.simSector % n : Math.floor(t / 6) % n;
  for (let j = 0; j < n; j++) {
    let cx = (j + 0.5) / n, y = top + jump, aL = 0.3, aR = 0.3, hand = null;
    const ph = j * 1.7;
    if (p === 0) { cx = clamp(mouse.x - 0.12, 0.1, 0.9); hand = mouse; }
    else if (p === 1) { aL = 0.6 + 0.35 * Math.sin(t * 1.3); aR = 0.6 + 0.35 * Math.sin(t * 1.3 + 1); }               // solo calme
    else if (p === 2) { aL = 1.6 + 1.1 * Math.sin(t * tw * (0.7 + 0.5 * j) + ph); aR = 1.4 + 1.2 * Math.sin(t * tw * (0.9 + 0.4 * j)); }   // duo libre
    else if (p === 3) { const s = Math.sin(t * tw * 112 / 120); aL = aR = 1.7 + 1.0 * s; cx += 0.02 * s; }            // trio synchronisé
    else if (p === 4) { const s = Math.sin(t * tw * 128 / 60); aL = 2.2 + 0.8 * s; aR = 2.2 - 0.8 * s; y -= 0.35 * T * Math.abs(Math.sin(t * tw * 128 / 120)); }
    else if (j === turn) { const s = Math.sin(t * tw * 112 / 60); aL = aR = 1.8 + 1.0 * s; }                           // tournée : chacun son tour
    out.push(figure(cx, y, T, aL, aR, hand));
  }
  return out;
}

export function update(dt) {
  if (settings.mode !== 'group') return;
  const S = settings.sectors, sim = settings.simulate;
  if (sim) ingest(simPoses(simT += dt), dt);
  else if (landmarker && state.capture.mode === 'camera' && video.readyState >= 2 && video.currentTime !== lastVT) {
    const dtV = clamp(video.currentTime - lastVT, 1 / 60, 0.2);
    lastVT = video.currentTime;
    let res = null;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch { /* image ignorée */ }
    if (res) ingest(res.landmarks.map((l) => l.map((q) => ({ x: 1 - q.x, y: q.y, visibility: q.visibility ?? 1 }))), dtV);
  } else if (!landmarker || state.capture.mode !== 'camera') ingest([], dt);

  const gain = settings.sensitivity / 1.3;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const s = slots[i], q = state.sec[i], r = S[i];
    if (!r) continue;
    r.present = s.on;
    const e = s.on ? clamp(s.tE * gain) : 0;
    q.energy = smooth(q.energy, e, dt, 0.12, 0.6);
    q.speed = smooth(q.speed, s.on ? s.tS : 0, dt, 0.25, 0.8);
    q.coherence = smooth(q.coherence, s.on ? s.tC : 0, dt, 0.5, 1.0);
    if (s.on) q.cy = smooth(q.cy, s.tCy, dt, 0.15);
    q.eFast = smooth(q.eFast, e, dt, 0.1); q.eSlow = smooth(q.eSlow, e, dt, 1.5);
    q.peakAge += dt;
    if (s.on && (s.jump || q.eFast - q.eSlow > 0.3) && q.peakAge > 1.2) { q.peakCount++; q.peakAge = 0; }
    s.jump = false;
    if (!s.on) { r.x = r.y = r.w = r.h = 0; continue; }
    // Le rectangle de la personne suit sa silhouette : il teinte les particules autour d'elle et place le son.
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (let k = 0; k < NJ; k++) {
      if (s.vis[k] < 0.3) continue;
      x0 = Math.min(x0, s.px[k]); x1 = Math.max(x1, s.px[k]); y0 = Math.min(y0, s.py[k]); y1 = Math.max(y1, s.py[k]);
    }
    const gx0 = clamp(Math.floor((x0 - 0.03) * GW), 0, GW - 2), gy0 = clamp(Math.floor((y0 - 0.04) * GH), 0, GH - 2);
    r.x = gx0; r.y = gy0;
    r.w = clamp(Math.ceil((x1 + 0.03) * GW) - gx0, 2, GW - gx0); r.h = clamp(Math.ceil((y1 + 0.04) * GH) - gy0, 2, GH - gy0);
    if (sim) for (const [k] of MOVERS) splat(s.px[k] * GW, s.py[k] * GH, s.vx[k] * GW, s.vy[k] * GH, 2.2);
  }
  rebuildSectorMap();
}
let simT = 0;
