// Le dôme : une évocation de l'univers des affiches de l'Assemblée créative de Genève, jamais une reproduction.
// Une masse noire au ras du sol, un liseré de lumière et un grain de pointillés, à la manière d'une encre.
// Il incarne la jauge collective : presque enfoui au repos, il se lève à mesure qu'on joue ensemble, la lueur
// derrière lui passe du vert de la nuit au bleu du lac puis à l'orange du matin, et deux lueurs s'ouvrent à sa
// base quand les trois places jouent ensemble.
import { state, settings, actColors, clamp, smooth } from './state.js';

let cv, g, W = 0, H = 0, grain = null, tinted = null, tg = null;
let rise = 0, glow = 0, eyes = 0, blinkIn = 4, blink = 0, hop = 0, lastAccent = 0;
const GS = 900;                    // côté de la texture de grain (dôme entier, carré)

const css = (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Grain : des points blancs, serrés sur le flanc éclairé (haut gauche), rares vers l'ombre. Tiré une fois pour toutes.
function makeGrain() {
  grain = canvas(GS, GS); tinted = canvas(GS, GS); tg = tinted.getContext('2d');
  const c = grain.getContext('2d'), R = GS / 2;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.fillStyle = '#fff';
  for (let i = 0; i < 420000; i++) {
    const a = rnd() * 6.2832, r = Math.sqrt(rnd()), nx = r * Math.cos(a), ny = r * Math.sin(a), nz = Math.sqrt(1 - r * r);
    const lit = clamp(-0.5 * nx - 0.82 * ny + 0.12 * nz), edge = r ** 3;
    const p = clamp(lit ** 2.6 * (0.05 + 1.5 * edge * edge));
    if (rnd() > p) continue;
    const s = 0.7 + rnd() * 1.3;
    c.globalAlpha = 0.35 + 0.65 * rnd();
    c.fillRect(R + nx * R - s / 2, R + ny * R - s / 2, s, s);
  }
}

export function init(el) { cv = el; g = cv.getContext('2d'); makeGrain(); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!settings.creature) return;
  const idle = !state.music.running;           // écran d'accueil : le dôme attend, à demi levé
  const d = state.drama, m = state.m, mu = state.music;
  const climax = d.phase === 'climax', sleeping = d.attract, { ink } = actColors();

  rise = smooth(rise, idle ? 0.3 + 0.02 * Math.sin(t * 0.7) : sleeping ? 0 : d.gauge, dt, 0.9, 1.6);
  glow = smooth(glow, idle ? 0.42 + 0.08 * Math.sin(t * 0.7) : d.hush ? 0.08 : sleeping ? 0.12 : d.lift > 0 ? 0.5 + 0.5 * d.lift : climax ? 1 : 0.2 + 0.6 * d.gauge + 0.2 * clamp(m.energy), dt, 0.6, 1.4);
  eyes = smooth(eyes, climax ? 1 : clamp((d.gauge - 0.66) / 0.3), dt, 0.5, 1.2);
  if (mu.accentCount !== lastAccent) { lastAccent = mu.accentCount; hop = 1; }
  hop *= Math.exp(-dt * 3.5);
  blinkIn -= dt;
  if (blinkIn < 0) { blink = 1; blinkIn = 3 + Math.random() * 5; }
  blink = Math.max(0, blink - dt * 6);

  const beat = mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const R = Math.min(W * 0.27, H * 0.56);
  const up = R * (0.1 + 0.82 * rise + (sleeping ? 0.012 * Math.sin(t * 0.9) : 0) + 0.02 * beat * rise + 0.03 * hop);
  const cx = W / 2, cy = H + R - up;

  // Lueur derrière le dôme : la nuit, le lac, puis le matin.
  const halo = g.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * (1.5 + 1.3 * glow));
  halo.addColorStop(0, css(ink, 0.5 * glow * (0.85 + 0.15 * beat))); halo.addColorStop(0.45, css(ink, 0.14 * glow)); halo.addColorStop(1, css(ink, 0));
  g.fillStyle = halo; g.fillRect(0, 0, W, H);

  // Masse noire, puis le grain à la couleur du moment.
  g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fillStyle = '#000'; g.fill();
  tg.globalCompositeOperation = 'source-over';
  tg.clearRect(0, 0, GS, GS);
  tg.fillStyle = css([0.35 + 0.65 * ink[0], 0.35 + 0.65 * ink[1], 0.35 + 0.65 * ink[2]]); tg.fillRect(0, 0, GS, GS);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(grain, 0, 0);
  g.globalAlpha = clamp(0.25 + 0.75 * glow + 0.1 * beat);
  g.drawImage(tinted, cx - R, cy - R, 2 * R, 2 * R);
  g.globalAlpha = 1;
  // Liseré : un trait de lumière sur le flanc éclairé.
  const rim = g.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy);
  rim.addColorStop(0, css([1, 1, 1], 0.2 + 0.7 * glow)); rim.addColorStop(1, css([1, 1, 1], 0));
  g.lineWidth = Math.max(1.5, R * 0.008); g.strokeStyle = rim;
  g.beginPath(); g.arc(cx, cy, R - g.lineWidth / 2, Math.PI * 0.95, Math.PI * 1.75); g.stroke();

  // Deux lueurs au ras du sol, seulement quand on y est presque tous.
  const o = eyes * (1 - blink);
  if (o > 0.01 && up > R * 0.35) {
    const er = R * 0.07;
    for (const side of [-1, 1]) {
      const ex = cx + side * R * 0.27;
      g.save();
      g.beginPath(); g.rect(ex - er * 2, H - er * 0.75 * o, er * 4, er); g.clip();
      const e = g.createRadialGradient(ex, H, er * 0.2, ex, H, er * 1.5);
      e.addColorStop(0, css([1, 1, 1], 0.95)); e.addColorStop(0.62, css([1, 1, 1], 0.9)); e.addColorStop(0.7, css([1, 1, 1], 0.18)); e.addColorStop(1, css([1, 1, 1], 0));
      g.fillStyle = e; g.fillRect(ex - er * 2, H - er * 2, er * 4, er * 2);
      g.restore();
    }
  }
}
