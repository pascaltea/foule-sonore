// Dessin de la créature, sans aucune dépendance : utilisé par la scène (creature.js) et par les pages publiques.
// Une masse noire, un grain de pointillés, un liseré de lumière. Ses strates sont les pays traversés, ses veines
// vertes les débordements de Genève. Autour d'elle, une aura qui ne s'arrête jamais : des nappes de couleur qui
// tournent lentement et un grain vert qui respire.
const GS = 900, DEPTH = 0.92 * GS / 2;
export const GREEN = [0.24, 0.92, 0.59];
// Forme neutre : le dôme. C'est celle de l'accueil, de l'attente et du début de chaque session.
export const PLAIN = { amp: 8, freq: 3, dens: 0.9, split: 0, gap: 0, rig: 1, sx: 1, sy: 1, crest: 0, sharp: 1, k: 10, lobes: 0, horns: 0, eGap: 0.27, eSize: 1, eOpen: 0.75, eAsym: 0, veins: 0, over: 0 };

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const css = (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let grain = null, skin = null, sg = null;

// Grain : des points blancs, serrés sur le flanc éclairé (haut gauche), rares vers l'ombre, plus un semis léger
// partout pour que les strates se lisent jusque dans l'ombre. Tiré une fois pour toutes.
function ready() {
  if (grain) return;
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

// Peau : les strates des pays, de la plus ancienne (en bas) à la plus récente (au sommet). Quand le trio ne joue
// pas ensemble, elles se décalent en trois colonnes ; quand il se tient, elles s'alignent. Puis les veines de Genève.
export function paintSkin(bands, o, t = 0) {
  ready();
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
  sg.globalCompositeOperation = 'source-over'; sg.strokeStyle = css(GREEN); sg.lineCap = 'round';
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
export function outline(c, cx, cy, R, o) {
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

// Aura : des nappes de couleur (celles des pays traversés, et le vert de Genève) qui tournent lentement derrière
// la créature. Elle ne s'arrête jamais et ne repasse jamais exactement au même endroit.
export function drawAura(c, w, ground, cx, cy, R, colors, t, strength = 1) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const cols = [...colors, GREEN];
  for (let k = 0; k < cols.length; k++) {
    const a = t * (0.11 + 0.023 * k) * (k % 2 ? -1 : 1) + k * 2.4, d = R * (0.35 + 0.3 * Math.sin(t * 0.17 + k * 1.3));
    const x = cx + d * Math.cos(a) * 1.25, y = cy - R * 0.55 + d * Math.sin(a) * 0.6, rad = R * (1.05 + 0.3 * Math.sin(t * 0.23 + k * 2));
    const gd = c.createRadialGradient(x, y, 0, x, y, rad);
    gd.addColorStop(0, css(cols[k], 0.2 * strength)); gd.addColorStop(0.5, css(cols[k], 0.07 * strength)); gd.addColorStop(1, css(cols[k], 0));
    c.fillStyle = gd; c.fillRect(0, 0, w, ground);
  }
  c.restore();
}
// Grain vert autour du contour : la trace durable des débordements, qui respire ; et le jaillissement du geste.
export function drawDust(c, ground, cx, cy, R, f, t, alpha = 1, flood = 0, count = 4200) {
  const spill = f.over + 1.6 * flood;
  if (spill < 0.02) return;
  let sd = 11;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const n = Math.min(count * 1.7, count * spill), reach = 0.75 * f.over + 2.6 * flood * (1.15 - flood);
  for (let i = 0; i < n; i++) {
    const breathe = 0.82 + 0.18 * Math.sin(t * 0.5 + i * 0.37), th = 3.1416 + rnd() * 3.1416 + 0.05 * Math.sin(t * 0.21 + i), far = rnd() ** 2.2 * reach * breathe;
    const x = cx + R * (1 + far) * f.sx * Math.cos(th), y = cy + R * (1 + far) * f.sy * Math.sin(th), a = (0.8 - far * 0.55) * (0.4 + 0.6 * rnd()) * alpha, s = 0.8 + rnd() * 1.7, tint = rnd();
    if (y > ground || a <= 0.02) continue;
    c.fillStyle = `rgba(${(70 + 120 * tint) | 0},225,${(150 + 60 * tint) | 0},${a})`;
    c.fillRect(x, y, s, s);
  }
}
function drawBody(c, cx, cy, R, f, glow, beat) {
  outline(c, cx, cy, R, f); c.fillStyle = '#000'; c.fill();
  c.save(); outline(c, cx, cy, R, f); c.clip();
  const ext = 1 + Math.abs(f.crest) + Math.abs(f.lobes) + (f.horns > 0.5 ? 0.28 : 0);
  c.globalAlpha = clamp(0.25 + 0.75 * glow + 0.1 * beat);
  c.drawImage(skin, cx - R * f.sx * ext, cy - R * f.sy * ext, 2 * R * f.sx * ext, 2 * R * f.sy * ext);
  c.restore(); c.globalAlpha = 1;
  const rim = c.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy);
  rim.addColorStop(0, css([1, 1, 1], 0.2 + 0.7 * glow)); rim.addColorStop(1, css([1, 1, 1], 0));
  c.lineWidth = Math.max(1.5, R * 0.008); c.strokeStyle = rim; outline(c, cx, cy, R, f); c.stroke();
}
// Deux lueurs au ras du sol : leur écart, leur taille et leur ouverture parlent du trio.
export function drawEyes(c, ground, cx, R, f, open) {
  if (open <= 0.01) return;
  for (const side of [-1, 1]) {
    const er = R * 0.075 * f.eSize * (side > 0 ? 1 + f.eAsym : 1 - f.eAsym * 0.4), ex = cx + side * R * f.sx * f.eGap, op = open * f.eOpen / 0.75;
    c.save();
    c.beginPath(); c.rect(ex - er * 2, ground - er * 0.8 * Math.min(1.3, op), er * 4, er * 1.3); c.clip();
    const e = c.createRadialGradient(ex, ground, er * 0.2, ex, ground, er * 1.5);
    e.addColorStop(0, css([1, 1, 1], 0.95)); e.addColorStop(0.62, css([1, 1, 1], 0.9)); e.addColorStop(0.7, css([1, 1, 1], 0.18)); e.addColorStop(1, css([1, 1, 1], 0));
    c.fillStyle = e; c.fillRect(ex - er * 2, ground - er * 2, er * 4, er * 2);
    c.restore();
  }
}

// Dessine la créature entière dans n'importe quel contexte. La peau doit avoir été peinte (paintSkin) juste avant.
// ground = ligne du sol, cy = centre de la masse (sous le sol tant qu'elle n'est pas levée).
export function drawCreature(c, w, ground, cx, cy, R, o, f) {
  if (o.halo !== false) {
    const halo = c.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * (1.5 + 1.3 * o.glow));
    halo.addColorStop(0, css(o.ink, 0.5 * o.glow * (0.85 + 0.15 * o.beat))); halo.addColorStop(0.45, css(o.ink, 0.14 * o.glow)); halo.addColorStop(1, css(o.ink, 0));
    c.fillStyle = halo; c.fillRect(0, 0, w, ground);
  }
  if (o.aura) drawAura(c, w, ground, cx, cy, R, o.aura, o.t || 0, o.auraStrength ?? 1);
  drawDust(c, ground, cx, cy, R, f, o.t || 0, o.glow, o.flood || 0);
  drawBody(c, cx, cy, R, f, o.glow, o.beat);
  drawEyes(c, ground, cx, R, f, o.eyes);
}

// Une créature vivante dans un petit cadre (galerie, page d'une créature) : son corps est dessiné une fois pour
// toutes, puis seuls l'aura, le grain, un léger souffle et le clignement des lueurs sont rejoués à chaque image.
export class Living {
  constructor(el, item, { dust = 900 } = {}) {
    this.el = el; this.item = item; this.dust = dust; this.phase = (item.n || 1) * 1.7; this.blink = 0; this.next = 2 + ((item.n || 1) * 0.37) % 4; this.size = 0;
    this.colors = item.bands.map((b) => b.color).filter((c, i, a) => a.findIndex((x) => x === c) === i).slice(-4);
  }
  build(w, h) {
    this.w = w; this.h = h; this.R = h * 0.56;
    const f = { ...PLAIN, ...this.item.form };
    this.f = f; this.body = canvas(w, h);
    paintSkin(this.item.bands, f, 0);
    drawBody(this.body.getContext('2d'), w / 2, h + this.R * f.sy * 0.08, this.R, f, 1, 0);
  }
  draw(t, dt) {
    const el = this.el, dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
    if (!w || !h) return;
    if (w !== this.w || h !== this.h) { el.width = w; el.height = h; this.build(w, h); }
    const c = el.getContext('2d'), tt = t + this.phase, f = this.f, R = this.R, cx = w / 2, cy = h + R * f.sy * 0.08;
    this.next -= dt; if (this.next < 0) { this.blink = 1; this.next = 2.5 + (tt * 7.3) % 5; }
    this.blink = Math.max(0, this.blink - dt * 6);
    c.clearRect(0, 0, w, h);
    drawAura(c, w, h, cx, cy, R, this.colors, tt, 1.7);
    drawDust(c, h, cx, cy, R, f, tt, 1, 0, this.dust);
    const s = 1 + 0.012 * Math.sin(tt * 0.9);            // elle respire
    c.save(); c.translate(cx, h); c.scale(s, 1 / s * (1 + 0.02 * Math.sin(tt * 0.9))); c.translate(-cx, -h);
    c.drawImage(this.body, 0, 0);
    c.restore();
    drawEyes(c, h, cx, R, f, 1 - this.blink);
  }
}
// Anime toutes les créatures visibles d'une page avec une seule horloge.
export function animate(list) {
  let last = performance.now();
  const seen = new Set(), io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)))) : null;
  const watch = () => list().forEach((l) => { if (!l.watched) { l.watched = true; if (io) io.observe(l.el); else seen.add(l.el); } });
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    watch();
    for (const l of list()) if (seen.has(l.el)) l.draw(now / 1000, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
