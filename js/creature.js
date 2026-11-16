// Le dôme : une évocation de l'univers des affiches de l'Assemblée créative de Genève, jamais une reproduction.
// Une masse noire au ras du sol, un liseré de lumière et un grain de pointillés, à la manière d'une encre.
// Il incarne la jauge collective : presque enfoui au repos, il se lève à mesure qu'on joue ensemble, et deux
// lueurs s'ouvrent à sa base quand les trois places jouent ensemble.
// Pendant un voyage, chaque escale y dépose une strate à sa couleur (la plus récente au sommet) : à la fin, le
// dôme figé est la créature du trio, unique. portrait() en tire l'image qui rejoint la galerie.
import { state, settings, actColors, clamp, smooth } from './state.js';

let cv, g, W = 0, H = 0, grain = null, skin = null, sg = null;
let rise = 0, glow = 0, eyes = 0, blinkIn = 4, blink = 0, hop = 0, lastAccent = 0;
const GS = 900;                    // côté de la texture de grain (dôme entier, carré)
const DEPTH = 0.92 * GS / 2;       // hauteur du dôme entièrement levé, dans la texture

const css = (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Grain : des points blancs, serrés sur le flanc éclairé (haut gauche), rares vers l'ombre, plus un semis léger
// partout pour que les strates se lisent jusque dans l'ombre. Tiré une fois pour toutes.
function makeGrain() {
  grain = canvas(GS, GS); skin = canvas(GS, GS); sg = skin.getContext('2d');
  const c = grain.getContext('2d'), R = GS / 2;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.fillStyle = '#fff';
  for (let i = 0; i < 580000; i++) {
    const a = rnd() * 6.2832, r = Math.sqrt(rnd()), nx = r * Math.cos(a), ny = r * Math.sin(a), nz = Math.sqrt(1 - r * r);
    const lit = clamp(-0.5 * nx - 0.82 * ny + 0.12 * nz), edge = r ** 3;
    const p = i < 420000 ? clamp(lit ** 2.6 * (0.05 + 1.5 * edge * edge)) : 0.5;
    if (rnd() > p) continue;
    const s = 0.7 + rnd() * 1.3;
    c.globalAlpha = (i < 420000 ? 0.35 : 0.2) + 0.65 * rnd() * (i < 420000 ? 1 : 0.6);
    c.fillRect(R + nx * R - s / 2, R + ny * R - s / 2, s, s);
  }
}

export function init(el) { cv = el; g = cv.getContext('2d'); makeGrain(); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
}

// Peau du dôme : les strates, de la plus ancienne (en bas) à la plus récente (au sommet), séparées par des lignes
// ondulées propres à chaque escale, puis découpées dans le grain.
function paintSkin(bands, t) {
  sg.globalCompositeOperation = 'source-over';
  sg.globalAlpha = 1;
  sg.clearRect(0, 0, GS, GS);
  let total = 0, above = 0;
  for (const b of bands) total += b.w;
  for (const b of bands) above += b.w;
  for (let k = 0; k < bands.length; k++) {             // k = 0 : la plus ancienne, peinte en premier sur tout le dôme
    const b = bands[k], live = k === bands.length - 1, base = k === 0 ? GS : DEPTH * above / total;
    above -= b.w;
    const col = b.color;
    sg.globalAlpha = 1;
    sg.fillStyle = css([0.3 + 0.7 * col[0], 0.3 + 0.7 * col[1], 0.3 + 0.7 * col[2]], b.dens ?? 1);
    if (k === 0) { sg.fillStyle = css([0.3 + 0.7 * col[0], 0.3 + 0.7 * col[1], 0.3 + 0.7 * col[2]], 1); sg.fillRect(0, 0, GS, GS); continue; }
    // Efface ce qu'il y a dessous dans sa zone, puis pose sa couleur : chaque strate recouvre les précédentes.
    const drift = live ? t * 0.35 : 0, f = b.freq * 6.2832 / GS;
    sg.beginPath(); sg.moveTo(0, 0);
    for (let x = 0; x <= GS; x += 12) sg.lineTo(x, base + b.amp * Math.sin(x * f + b.phase + drift) + b.amp * 0.4 * Math.sin(x * f * 2.7 + b.phase * 1.7 - drift));
    sg.lineTo(GS, 0); sg.closePath();
    const paint = sg.fillStyle;
    sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = '#000'; sg.fill();
    sg.globalCompositeOperation = 'source-over'; sg.fillStyle = paint; sg.fill();
  }
  sg.globalAlpha = 1;
  sg.globalCompositeOperation = 'destination-in'; sg.drawImage(grain, 0, 0);
}

// Dessine le dôme (lueur, masse noire, peau, liseré, lueurs à la base) dans n'importe quel contexte.
function drawDome(c, w, h, cx, cy, R, o) {
  if (o.halo !== false) {
    const halo = c.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * (1.5 + 1.3 * o.glow));
    halo.addColorStop(0, css(o.ink, 0.5 * o.glow * (0.85 + 0.15 * o.beat))); halo.addColorStop(0.45, css(o.ink, 0.14 * o.glow)); halo.addColorStop(1, css(o.ink, 0));
    c.fillStyle = halo; c.fillRect(0, 0, w, h);
  }
  c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fillStyle = '#000'; c.fill();
  c.globalAlpha = clamp(0.25 + 0.75 * o.glow + 0.1 * o.beat);
  c.drawImage(skin, cx - R, cy - R, 2 * R, 2 * R);
  c.globalAlpha = 1;
  const rim = c.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy);
  rim.addColorStop(0, css([1, 1, 1], 0.2 + 0.7 * o.glow)); rim.addColorStop(1, css([1, 1, 1], 0));
  c.lineWidth = Math.max(1.5, R * 0.008); c.strokeStyle = rim;
  c.beginPath(); c.arc(cx, cy, R - c.lineWidth / 2, Math.PI * 0.95, Math.PI * 1.75); c.stroke();
  if (o.eyes > 0.01) {                         // deux lueurs au ras du sol
    const er = R * 0.07;
    for (const side of [-1, 1]) {
      const ex = cx + side * R * 0.27;
      c.save();
      c.beginPath(); c.rect(ex - er * 2, h - er * 0.75 * o.eyes, er * 4, er); c.clip();
      const e = c.createRadialGradient(ex, h, er * 0.2, ex, h, er * 1.5);
      e.addColorStop(0, css([1, 1, 1], 0.95)); e.addColorStop(0.62, css([1, 1, 1], 0.9)); e.addColorStop(0.7, css([1, 1, 1], 0.18)); e.addColorStop(1, css([1, 1, 1], 0));
      c.fillStyle = e; c.fillRect(ex - er * 2, h - er * 2, er * 4, er * 2);
      c.restore();
    }
  }
}

const bandsNow = () => (state.journey.bands.length ? state.journey.bands : [{ color: actColors().ink, w: 1, amp: 0, freq: 1, phase: 0 }]);

// Portrait de la créature d'une session : le dôme entièrement levé, ses strates, ses deux lueurs, sur fond noir.
export function portrait(w, h) {
  const c = canvas(w, h), x = c.getContext('2d'), R = h * 0.8;
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  paintSkin(bandsNow(), 0);
  drawDome(x, w, h, w / 2, h + R - R * 0.92, R, { ink: actColors().ink, glow: 1, beat: 0, eyes: 1, halo: false });      // fond noir pur : pas de cadre visible dans la galerie
  return c;
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!settings.creature) return;
  const idle = !state.music.running;           // écran d'accueil : le dôme attend, à demi levé
  const d = state.drama, m = state.m, mu = state.music;
  const ended = state.session.ended > 0;       // fin de session : la créature du trio, figée et entière
  const climax = d.phase === 'climax', sleeping = d.attract && !ended, { ink } = actColors();

  rise = smooth(rise, ended ? 1 : idle ? 0.3 + 0.02 * Math.sin(t * 0.7) : sleeping ? 0 : d.gauge, dt, ended ? 0.5 : 0.9, 1.6);
  glow = smooth(glow, ended ? 0.95 : idle ? 0.42 + 0.08 * Math.sin(t * 0.7) : d.hush ? 0.08 : sleeping ? 0.12 : d.lift > 0 ? 0.5 + 0.5 * d.lift :
    climax ? 1 : 0.2 + 0.6 * d.gauge + 0.2 * clamp(m.energy), dt, 0.6, 1.4);
  eyes = smooth(eyes, ended || climax ? 1 : clamp((d.gauge - 0.66) / 0.3), dt, 0.5, 1.2);
  if (mu.accentCount !== lastAccent) { lastAccent = mu.accentCount; hop = 1; }
  hop *= Math.exp(-dt * 3.5);
  blinkIn -= dt;
  if (blinkIn < 0) { blink = 1; blinkIn = 3 + Math.random() * 5; }
  blink = Math.max(0, blink - dt * 6);

  const beat = ended ? 0 : mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const R = Math.min(W * 0.27, H * 0.56);
  const up = R * (0.1 + 0.82 * rise + (sleeping ? 0.012 * Math.sin(t * 0.9) : 0) + 0.02 * beat * rise + 0.03 * hop);
  paintSkin(bandsNow(), ended ? 0 : t);
  drawDome(g, W, H, W / 2, H + R - up, R, { ink, glow, beat, eyes: up > R * 0.35 ? eyes * (1 - blink) : 0 });
}
