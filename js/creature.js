// La créature : une évocation de l'univers des affiches de l'Assemblée créative de Genève, jamais une reproduction.
// Une masse noire au ras du sol, un liseré de lumière et un grain de pointillés, à la manière d'une encre.
// Pendant la session elle incarne la jauge collective (elle se lève à mesure qu'on joue ensemble) et prend peu à
// peu la forme de la façon de jouer du trio (journey.js, formOf) : proportions, crête, têtes, cornes, lueurs.
// Chaque pays traversé y laisse une strate. Chaque fois que Genève déborde, une veine verte la traverse et son
// grain sort un peu plus de son contour. À la fin elle se fige ; portrait() en tire l'image de la galerie.
import { state, settings, actColors, clamp, smooth } from './state.js';

let cv, g, W = 0, H = 0, grain = null, skin = null, sg = null;
let rise = 0, glow = 0, eyes = 0, blinkIn = 4, blink = 0, hop = 0, lastAccent = 0;
const GS = 900;                    // côté de la texture de grain (créature entière, carré)
const DEPTH = 0.92 * GS / 2;
// Forme neutre : le dôme. C'est celle de l'accueil, de l'attente et du début de chaque session.
const PLAIN = { amp: 8, freq: 3, dens: 0.9, split: 0, gap: 0, rig: 1, sx: 1, sy: 1, crest: 0, sharp: 1, k: 10, lobes: 0, horns: 0, eGap: 0.27, eSize: 1, eOpen: 0.75, eAsym: 0, veins: 0, over: 0 };
const cur = { ...PLAIN };          // forme affichée, qui glisse vers celle du trio
const GREEN = 'rgb(60,235,150)';

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

// Peau : les strates des pays, de la plus ancienne (en bas) à la plus récente (au sommet). Quand le trio ne joue
// pas ensemble, elles se décalent en trois colonnes ; quand il se tient, elles s'alignent. Puis les veines de Genève.
function paintSkin(bands, o, t) {
  sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
  sg.clearRect(0, 0, GS, GS);
  let total = 0;
  for (const b of bands) total += b.w;
  const cols = o.split > 0.03 ? 3 : 1;
  for (let col = 0; col < cols; col++) {
    sg.save();
    if (cols > 1) { sg.beginPath(); sg.rect(col === 0 ? 0 : GS * (0.35 + (col - 1) * 0.3), 0, col === 1 ? GS * 0.3 : GS * 0.35, GS); sg.clip(); }
    const off = cols > 1 ? (col - 1) * o.split * 70 + Math.sin(col * 2.1) * o.split * 40 : 0;
    let above = total;
    for (let k = 0; k < bands.length; k++) {
      const b = bands[k], live = k === bands.length - 1, base = DEPTH * above / total + off, c3 = b.color;
      above -= b.w;
      const paint = css([0.3 + 0.7 * c3[0], 0.3 + 0.7 * c3[1], 0.3 + 0.7 * c3[2]], k === 0 ? 1 : o.dens);
      sg.globalCompositeOperation = 'source-over';
      if (k === 0) { sg.fillStyle = paint; sg.fillRect(0, 0, GS, GS); continue; }
      const drift = live ? t * 0.35 : 0, f = o.freq * 6.2832 / GS, ph = k * 1.9 + col * 0.7;
      sg.beginPath(); sg.moveTo(0, 0);
      for (let x = 0; x <= GS; x += 12) sg.lineTo(x, base + o.amp * Math.sin(x * f + ph + drift) + o.amp * 0.4 * Math.sin(x * f * 2.7 + ph * 1.7 - drift));
      sg.lineTo(GS, 0); sg.closePath();
      sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = '#000'; sg.fill();
      sg.globalCompositeOperation = 'source-over'; sg.fillStyle = paint; sg.fill();
      if (o.gap > 0.5) { sg.globalCompositeOperation = 'destination-out'; sg.strokeStyle = '#000'; sg.lineWidth = 3 + 4 * o.gap; sg.stroke(); }   // silences tenus : une respiration noire
    }
    sg.restore();
  }
  // Veines : Genève remonte à travers les pays, une par débordement.
  const nv = Math.round(o.veins);
  sg.globalCompositeOperation = 'source-over'; sg.strokeStyle = GREEN; sg.lineCap = 'round';
  for (let v = 0; v < nv; v++) {
    const a = (v - (nv - 1) / 2) * 0.34, x0 = GS / 2 + a * 120;
    sg.lineWidth = 20 - (v % 3) * 4;
    sg.beginPath(); sg.moveTo(x0, DEPTH + 30);
    for (let k = 1; k <= 24; k++) { const u = k / 24; sg.lineTo(x0 + Math.sin(a) * u * GS * 0.75 + 18 * Math.sin(u * 9 + v * 2.1) * (1 - o.rig * 0.8), DEPTH + 30 - u * (DEPTH + 10)); }
    sg.stroke();
  }
  sg.globalCompositeOperation = 'destination-in'; sg.globalAlpha = 1; sg.drawImage(grain, 0, 0);
}

// Contour : proportions, crête, têtes et cornes. Avec la forme neutre, c'est un cercle.
function outline(c, cx, cy, R, o) {
  const hn = Math.round(o.horns);
  c.beginPath();
  for (let i = 0; i <= 540; i++) {
    const th = i / 540 * 6.2832, up = Math.max(0, -Math.sin(th)), w = Math.sin(th * o.k + 1);
    let r = 1 + o.crest * (0.6 * Math.sign(w) * Math.abs(w) ** o.sharp + 0.4 * Math.sin(th * o.k * 2.3 + 2)) * up + o.lobes * Math.cos(3 * (th - 4.712)) * up;
    for (let h = 0; h < hn; h++) r += (0.2 + 0.07 * (h % 2)) * Math.exp(-(((th - (4.712 + (h - (hn - 1) / 2) * 0.34)) / 0.04) ** 2));
    const x = cx + R * r * o.sx * Math.cos(th), y = cy + R * r * o.sy * Math.sin(th);
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
}

// Dessine la créature dans n'importe quel contexte : lueur, grain qui déborde, masse noire, peau, liseré, lueurs.
// ground = ligne du sol (bas de l'image), cy = centre de la masse (sous le sol tant qu'elle n'est pas levée).
function drawCreature(c, w, ground, cx, cy, R, o, f) {
  if (o.halo !== false) {
    const halo = c.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * (1.5 + 1.3 * o.glow));
    halo.addColorStop(0, css(o.ink, 0.5 * o.glow * (0.85 + 0.15 * o.beat))); halo.addColorStop(0.45, css(o.ink, 0.14 * o.glow)); halo.addColorStop(1, css(o.ink, 0));
    c.fillStyle = halo; c.fillRect(0, 0, w, ground);
  }
  // Genève déborde : le grain vert sort du contour (trace durable), et jaillit plus loin au moment du geste.
  const spill = f.over + 1.6 * (o.flood || 0);
  if (spill > 0.02) {
    let sd = 11;
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const n = Math.min(7000, 4200 * spill), reach = 0.75 * f.over + 2.6 * (o.flood || 0) * (1.15 - (o.flood || 0));
    for (let i = 0; i < n; i++) {
      const th = 3.1416 + rnd() * 3.1416, far = rnd() ** 2.2 * reach, x = cx + R * (1 + far) * f.sx * Math.cos(th), y = cy + R * (1 + far) * f.sy * Math.sin(th), a = (0.8 - far * 0.55) * (0.4 + 0.6 * rnd()) * o.glow, s = 0.8 + rnd() * 1.7;
      if (y > ground || a <= 0.02) continue;
      c.fillStyle = `rgba(${(70 + 120 * rnd()) | 0},225,${(150 + 60 * rnd()) | 0},${a})`;
      c.fillRect(x, y, s, s);
    }
  }
  outline(c, cx, cy, R, f); c.fillStyle = '#000'; c.fill();
  c.save(); outline(c, cx, cy, R, f); c.clip();
  const ext = 1 + Math.abs(f.crest) + Math.abs(f.lobes) + (f.horns > 0.5 ? 0.28 : 0);
  c.globalAlpha = clamp(0.25 + 0.75 * o.glow + 0.1 * o.beat);
  c.drawImage(skin, cx - R * f.sx * ext, cy - R * f.sy * ext, 2 * R * f.sx * ext, 2 * R * f.sy * ext);
  c.restore(); c.globalAlpha = 1;
  const rim = c.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy);
  rim.addColorStop(0, css([1, 1, 1], 0.2 + 0.7 * o.glow)); rim.addColorStop(1, css([1, 1, 1], 0));
  c.lineWidth = Math.max(1.5, R * 0.008); c.strokeStyle = rim; outline(c, cx, cy, R, f); c.stroke();
  if (o.eyes > 0.01) {                         // deux lueurs au ras du sol : leur écart, leur taille et leur ouverture parlent du trio
    for (const side of [-1, 1]) {
      const er = R * 0.075 * f.eSize * (side > 0 ? 1 + f.eAsym : 1 - f.eAsym * 0.4), ex = cx + side * R * f.sx * f.eGap, op = o.eyes * f.eOpen / 0.75;
      c.save();
      c.beginPath(); c.rect(ex - er * 2, ground - er * 0.8 * Math.min(1.3, op), er * 4, er * 1.3); c.clip();
      const e = c.createRadialGradient(ex, ground, er * 0.2, ex, ground, er * 1.5);
      e.addColorStop(0, css([1, 1, 1], 0.95)); e.addColorStop(0.62, css([1, 1, 1], 0.9)); e.addColorStop(0.7, css([1, 1, 1], 0.18)); e.addColorStop(1, css([1, 1, 1], 0));
      c.fillStyle = e; c.fillRect(ex - er * 2, ground - er * 2, er * 4, er * 2);
      c.restore();
    }
  }
}

const bandsNow = () => (state.journey.bands.length ? state.journey.bands : [{ color: actColors().ink, w: 1 }]);

// Portrait de la créature d'une session : entièrement levée, sur fond noir pur (pas de cadre visible dans la galerie).
export function portrait(w, h) {
  const c = canvas(w, h), x = c.getContext('2d'), f = { ...PLAIN, ...(state.journey.form || {}) }, R = h * 0.6;
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  paintSkin(bandsNow(), f, 0);
  drawCreature(x, w, h, w / 2, h + R * f.sy * 0.08, R, { ink: actColors().ink, glow: 1, beat: 0, eyes: 1, halo: false, flood: 0 }, f);
  return c;
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!settings.creature) return;
  const idle = !state.music.running;           // écran d'accueil : le dôme attend, à demi levé
  const d = state.drama, m = state.m, mu = state.music, J = state.journey;
  const ended = state.session.ended > 0;       // fin de session : la créature du trio, figée et entière
  const climax = d.phase === 'climax', sleeping = d.attract && !ended, { ink } = actColors();

  // La forme glisse vers celle du trio : presque rien au début, de plus en plus à mesure que la session avance.
  const target = J.form && !idle && !sleeping ? J.form : PLAIN, tau = ended ? 0.7 : 2.5;
  const trust = ended ? 1 : J.form ? clamp(state.session.t / 150) * 0.85 : 1;
  for (const k in PLAIN) cur[k] = smooth(cur[k], PLAIN[k] + (target[k] - PLAIN[k]) * (k === 'veins' || k === 'over' ? 1 : trust), dt, k === 'veins' ? 0.4 : tau);

  rise = smooth(rise, ended ? 1 : idle ? 0.3 + 0.02 * Math.sin(t * 0.7) : sleeping ? 0 : d.gauge, dt, ended ? 0.5 : 0.9, 1.6);
  glow = smooth(glow, ended ? 0.95 : idle ? 0.42 + 0.08 * Math.sin(t * 0.7) : d.hush ? 0.08 : sleeping ? 0.12 : d.lift > 0 ? 0.5 + 0.5 * d.lift :
    climax ? 1 : 0.2 + 0.6 * d.gauge + 0.2 * clamp(m.energy) + 0.5 * state.flood, dt, 0.6, 1.4);
  eyes = smooth(eyes, ended || climax ? 1 : clamp((d.gauge - 0.66) / 0.3), dt, 0.5, 1.2);
  if (mu.accentCount !== lastAccent) { lastAccent = mu.accentCount; hop = 1; }
  hop *= Math.exp(-dt * 3.5);
  blinkIn -= dt;
  if (blinkIn < 0) { blink = 1; blinkIn = 3 + Math.random() * 5; }
  blink = Math.max(0, blink - dt * 6);

  const beat = ended ? 0 : mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const R = Math.min(W * 0.27, H * 0.56) * (ended ? 0.82 : 1);
  const up = R * cur.sy * (0.1 + 0.82 * rise + (sleeping ? 0.012 * Math.sin(t * 0.9) : 0) + 0.02 * beat * rise + 0.03 * hop);
  paintSkin(bandsNow(), cur, ended ? 0 : t);
  drawCreature(g, W, H, W / 2, H + R * cur.sy - up, R, { ink, glow: clamp(glow), beat, eyes: up > R * 0.3 ? eyes * (1 - blink) : 0, flood: ended ? 0 : state.flood }, cur);
}
