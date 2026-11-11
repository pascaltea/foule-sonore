// Métriques de foule (0..1, lissées) et dramaturgie collective.
import { GW, GH, GN, MAX_SECTORS, state, settings, clamp, smooth } from './state.js';

const SPEED_REF = 9;            // cellules/s considérées comme « rapide » (foule filmée de loin)
const HN = 480;                 // 8 s d'historique à 60 Hz pour la pulsation
const hist = new Float32Array(HN), buf = new Float32Array(HN);
let hPos = 0, hAcc = 0, pulseT = 0, eFast = 0, eSlow = 0;
const NS = MAX_SECTORS;
const za = new Float32Array(NS), zx = new Float32Array(NS), zy = new Float32Array(NS), zm = new Float32Array(NS), zc = new Float32Array(NS);

export function updateMetrics(dt) {
  const { x: FX, y: FY, act: A } = state.flow, m = state.m;
  let sa = 0, sx = 0, sy = 0, smag = 0, cx = 0, cy = 0;
  za.fill(0); zx.fill(0); zy.fill(0); zm.fill(0); zc.fill(0);
  const map = state.cellSector;
  for (let i = 0; i < GN; i++) {
    const a = A[i];
    if (a < 0.02) continue;
    const gx = i % GW, gy = (i / GW) | 0, fx = FX[i], fy = FY[i];
    sa += a; sx += a * fx; sy += a * fy; smag += a * Math.hypot(fx, fy);
    cx += a * gx; cy += a * gy;
    const z = map[i];
    if (z >= 0) { za[z] += a; zx[z] += a * fx; zy[z] += a * fy; zm[z] += a * Math.hypot(fx, fy); zc[z] += a * gy; }
  }
  // Une foule qui anime environ un quart de l'image donne une énergie de 1.
  const eRaw = clamp(sa / GN * 4.5);
  m.energyRaw = eRaw;
  m.energy = smooth(m.energy, eRaw, dt, 0.25, 1.0);

  const active = sa > 1.5;
  m.speed = smooth(m.speed, active ? clamp(smag / sa / SPEED_REF) : 0, dt, 0.4, 0.9);
  const coh = active && smag > 1e-3 ? Math.hypot(sx, sy) / smag * clamp(sa / 12) : 0;
  m.coherence = smooth(m.coherence, clamp(coh * 1.15), dt, 0.7, 1.4);
  if (active && smag > 1e-3) {
    m.dirX = smooth(m.dirX, sx / smag, dt, 0.3);
    m.dirY = smooth(m.dirY, sy / smag, dt, 0.3);
    const ncx = (cx / sa + 0.5) / GW, ncy = (cy / sa + 0.5) / GH;
    m.cx = smooth(m.cx, ncx, dt, 0.6);
    m.cy = smooth(m.cy, ncy, dt, 0.6);
    let disp = 0;
    for (let i = 0; i < GN; i++) {
      const a = A[i];
      if (a < 0.02) continue;
      const dx = ((i % GW) + 0.5) / GW - ncx, dy = (((i / GW) | 0) + 0.5) / GH - ncy;
      disp += a * (dx * dx + dy * dy);
    }
    m.dispersion = smooth(m.dispersion, clamp(Math.sqrt(disp / sa) * 2.5), dt, 0.6);
  }
  // Mêmes métriques par secteur, normalisées par sa surface.
  const group = settings.mode === 'group';     // en petit groupe, pose.js renseigne lui-même chaque personne
  for (let z = 0; z < NS && !group; z++) {
    const q = state.sec[z], s = settings.sectors[z], area = state.secArea[z];
    const e = s && area ? clamp(za[z] / area * 4.5) : 0;
    const act = za[z] > Math.max(0.4, area * 0.004) && zm[z] > 1e-3;
    q.energy = smooth(q.energy, e, dt, 0.2, 0.8);
    q.speed = smooth(q.speed, act ? clamp(zm[z] / za[z] / SPEED_REF) : 0, dt, 0.4, 0.9);
    q.coherence = smooth(q.coherence, act ? clamp(Math.hypot(zx[z], zy[z]) / zm[z] * 1.15) : 0, dt, 0.7, 1.4);
    if (act) q.cy = smooth(q.cy, clamp((zc[z] / za[z] + 0.5 - s.y) / s.h), dt, 0.5);
    q.eFast = smooth(q.eFast, e, dt, 0.1); q.eSlow = smooth(q.eSlow, e, dt, 1.5);
    q.peakAge += dt;
    if (q.eFast - q.eSlow > 0.22 && q.peakAge > 1.5) { q.peakCount++; q.peakAge = 0; }
  }

  if (group) {
    // À échelle humaine, « bouger ensemble » = que toutes les personnes présentes jouent en même temps.
    let n = 0, se = 0, on = 0;
    settings.sectors.forEach((s, i) => { if (s.present) { n++; se += state.sec[i].energy; if (state.sec[i].energy > 0.12) on++; } });
    const ge = n ? se / n : 0;
    m.energy = Math.max(m.energy, ge);
    m.coherence = smooth(m.coherence, n && ge > 0.06 ? clamp(0.3 + 0.7 * on / n) : 0, dt, 0.7, 1.4);
  }

  // Événements : pic soudain et immobilité.
  eFast = smooth(eFast, eRaw, dt, 0.1);
  eSlow = smooth(eSlow, eRaw, dt, 1.5);
  m.peakAge += dt;
  if (eFast - eSlow > 0.2 && m.peakAge > 1.2) { m.peakCount++; m.peakAge = 0; }
  if (m.energy < 0.05) m.stillTime += dt; else if (m.energy > 0.08) m.stillTime = 0;
  m.still = m.stillTime > 4;

  // Pulsation : autocorrélation de l'énergie instantanée, entre 60 et 180 BPM.
  hAcc += dt;
  while (hAcc >= 1 / 60) { hAcc -= 1 / 60; hist[hPos] = eRaw; hPos = (hPos + 1) % HN; }
  pulseT += dt;
  if (pulseT > 0.5) { pulseT = 0; analysePulse(dt); }
}

function analysePulse() {
  const m = state.m;
  let mean = 0;
  for (let i = 0; i < HN; i++) { buf[i] = hist[(hPos + i) % HN]; mean += buf[i]; }
  mean /= HN;
  let r0 = 0;
  for (let i = 0; i < HN; i++) { buf[i] -= mean; r0 += buf[i] * buf[i]; }
  let conf = 0, bpm = 0;
  if (r0 / HN > 2e-4) {
    const r = [];
    let max = 0;
    for (let lag = 19; lag <= 61; lag++) {
      let s = 0;
      for (let i = 0; i < HN - lag; i++) s += buf[i] * buf[i + lag];
      r[lag] = s / (HN - lag) / (r0 / HN);
      if (lag >= 20 && lag <= 60 && r[lag] > max) max = r[lag];
    }
    // Le plus petit décalage presque aussi bon que le meilleur : la période fondamentale.
    for (let lag = 20; lag <= 60; lag++) {
      if (r[lag] >= 0.9 * max && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        const den = r[lag - 1] - 2 * r[lag] + r[lag + 1];
        const off = den ? 0.5 * (r[lag - 1] - r[lag + 1]) / den : 0;
        bpm = 3600 / (lag + clamp(off, -0.5, 0.5));
        conf = clamp(r[lag]);
        break;
      }
    }
  }
  while (bpm && bpm < 70) bpm *= 2;
  while (bpm > 140) bpm /= 2;
  m.pulseConf += (conf - m.pulseConf) * 0.4;
  if (conf > 0.35 && bpm) m.pulseBpm = m.pulseBpm ? m.pulseBpm + (bpm - m.pulseBpm) * 0.5 : bpm;
}

// Jauge collective : monte quand la foule bouge ensemble, débloque 3 paliers puis un climax.
export function updateDrama(dt) {
  const d = state.drama, m = state.m, k = settings.dramaSpeed;
  d.phaseT += dt;
  if (d.phase === 'build') {
    // Bouger ne suffit pas : c'est bouger ensemble qui remplit la jauge.
    const coop = m.energy * (0.1 + 0.9 * m.coherence * m.coherence);
    d.gauge = clamp(d.gauge + dt * k * (0.024 * coop - 0.004 - 0.006 * (1 - m.energy)));
    if (d.gauge >= 1) { d.phase = 'climax'; d.phaseT = 0; d.tierUps++; }
  } else if (d.phase === 'climax') {
    d.gauge = 1;
    if (d.phaseT > 22 || m.still) { d.phase = 'release'; d.phaseT = 0; }
  } else {
    d.gauge = Math.max(0.15, d.gauge - dt * 0.07);
    if (d.gauge <= 0.15) { d.phase = 'build'; d.phaseT = 0; }
  }
  let tier = d.tier;
  const g = d.gauge;
  if (d.phase === 'climax') tier = 3;
  else {
    const up = g >= 0.75 ? 3 : g >= 0.5 ? 2 : g >= 0.25 ? 1 : 0;
    const down = g >= 0.7 ? 3 : g >= 0.45 ? 2 : g >= 0.2 ? 1 : 0;
    if (up > tier) { tier = up; if (d.phase === 'build') d.tierUps++; }
    else if (down < tier) tier = down;
  }
  d.tier = tier;
  if (m.stillTime > 12) d.attract = true; else if (m.energy > 0.08) d.attract = false;
}
