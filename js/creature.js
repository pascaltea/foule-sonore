// La Créature des affiches de l'Assemblée créative de Genève : un dôme noir et deux yeux qui dépassent du sol.
// Elle incarne la jauge collective. Au repos elle somnole ; plus on joue ensemble, plus elle se lève et ouvre
// les yeux ; au climax elle est debout et rayonne. Son regard suit la personne qui joue le plus.
import { GW, MAX_SECTORS, state, settings, clamp, smooth } from './state.js';

let cv, g, W = 0, H = 0;
let rise = 0, open = 0.4, lookX = 0, lookY = 0, rays = 0, spin = 0, blinkIn = 3, blink = 0, hop = 0, lastAccent = 0;
const tint = [255, 255, 255];

const rgb = (hex) => { const h = parseInt(hex.slice(1), 16); return [h >> 16, (h >> 8) & 255, h & 255]; };
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function init(canvas) { cv = canvas; g = cv.getContext('2d'); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!settings.creature || !state.music.running) return;
  const d = state.drama, m = state.m, mu = state.music, S = settings.sectors;
  const climax = d.phase === 'climax', sleeping = d.attract;

  // Qui joue ? Le regard et la teinte du dôme penchent vers les plus actifs.
  let we = 0, wx = 0, r = 0, gr = 0, b = 0;
  for (let i = 0; i < Math.min(S.length, MAX_SECTORS); i++) {
    const s = S[i], q = state.sec[i];
    if (!q.on || s.present === false || !s.w) continue;
    const e = q.energy + 0.6 * q.pulse, c = rgb(s.color);
    we += e; wx += e * (s.x + s.w / 2) / GW; r += e * c[0]; gr += e * c[1]; b += e * c[2];
  }
  const target = we > 0.02 ? [r / we, gr / we, b / we] : [255, 255, 255];
  for (let k = 0; k < 3; k++) tint[k] = smooth(tint[k], target[k], dt, 0.5);
  lookX = smooth(lookX, sleeping ? 0.5 * Math.sin(t * 0.35) : we > 0.02 ? clamp((wx / we - 0.5) * 2.4, -1, 1) : 0, dt, 0.35);
  lookY = smooth(lookY, sleeping ? 0.3 : -0.25 - 0.5 * clamp(m.energy * 1.5), dt, 0.5);

  rise = smooth(rise, sleeping ? 0 : d.gauge, dt, 0.6, 1.2);
  open = smooth(open, sleeping ? 0.38 : climax ? 1 : 0.55 + 0.45 * clamp(d.gauge * 1.6 + m.energy), dt, 0.3, 0.8);
  rays = smooth(rays, climax ? 1 : d.tier >= 3 ? 0.4 : d.tier === 2 ? 0.16 : 0, dt, 0.5, 1.5);
  spin += dt * (0.03 + 0.12 * rays);
  if (mu.accentCount !== lastAccent) { lastAccent = mu.accentCount; hop = 1; }
  hop *= Math.exp(-dt * 4);
  blinkIn -= dt;
  if (blinkIn < 0) { blink = 1; blinkIn = (sleeping ? 2.5 : 4) + Math.random() * 4; }
  blink = Math.max(0, blink - dt * 7);

  const R = Math.min(W * 0.19, H * 0.4);
  const beat = mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const breathe = sleeping ? 0.03 * Math.sin(t * 1.3) : 0;
  const up = R * (0.4 + 0.8 * rise + breathe + 0.05 * beat + 0.1 * hop);     // hauteur visible au-dessus du sol
  const cx = W / 2, cy = H + R - up;

  // Rayons (affiche « Rayonner ») : ils partent du sol, derrière la Créature, aux couleurs des trois places.
  if (rays > 0.01) {
    const N = 18, L = Math.hypot(W, H), cols = S.slice(0, 3).map((s) => rgb(s.color));
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI + ((i + (spin % 2)) / N) * Math.PI, a1 = a0 + Math.PI / N * 0.5;
      if (a0 > 2 * Math.PI) continue;
      const c = cols[i % cols.length] || [255, 255, 255];
      const gd = g.createRadialGradient(cx, H, R * 0.6, cx, H, L * 0.8);
      gd.addColorStop(0, css(c, 0.5 * rays * (0.75 + 0.25 * beat))); gd.addColorStop(1, css(c, 0));
      g.fillStyle = gd;
      g.beginPath(); g.moveTo(cx, H); g.arc(cx, H, L, a0, Math.min(a1, 2 * Math.PI)); g.closePath(); g.fill();
    }
  }

  // Dôme : noir, liseré blanc, reflet à la couleur de ceux qui jouent.
  g.beginPath(); g.arc(cx, cy, R, 0, 6.2832);
  g.fillStyle = '#000'; g.fill();
  const hl = g.createRadialGradient(cx - R * 0.45, cy - R * 0.55, R * 0.05, cx - R * 0.2, cy - R * 0.2, R * 1.05);
  hl.addColorStop(0, css(tint, 0.34 + 0.3 * clamp(m.energy) + 0.2 * beat)); hl.addColorStop(0.55, css(tint, 0.08)); hl.addColorStop(1, css(tint, 0));
  g.fillStyle = hl; g.fill();
  g.lineWidth = Math.max(2, R * 0.022); g.strokeStyle = '#fff'; g.stroke();

  // Yeux : toujours au ras du sol, comme sur les affiches.
  const er = R * 0.1, ey = Math.min(cy - R * 0.62, H - er * 1.5 - R * 0.05), lid = clamp(open * (1 - blink));
  for (const side of [-1, 1]) {
    const ex = cx + side * R * 0.3;
    g.save();
    g.beginPath(); g.arc(ex, ey, er, 0, 6.2832); g.clip();
    g.fillStyle = '#fff'; g.fillRect(ex - er, ey - er, 2 * er, 2 * er);
    g.fillStyle = '#000';
    g.beginPath(); g.arc(ex + lookX * er * 0.42, ey + lookY * er * 0.4, er * (climax ? 0.4 : 0.5), 0, 6.2832); g.fill();
    g.fillRect(ex - er, ey - er, 2 * er, 2 * er * (1 - lid));          // paupière
    g.restore();
    g.lineWidth = Math.max(1.5, R * 0.014); g.strokeStyle = '#000';
    g.beginPath(); g.arc(ex, ey, er, 0, 6.2832); g.stroke();
  }
}
