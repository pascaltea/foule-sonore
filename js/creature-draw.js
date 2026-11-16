// Dessin de la créature, sans aucune dépendance : utilisé par la scène (creature.js) et par les pages publiques.
// Une masse noire, un grain de pointillés, un liseré de lumière. Ses strates sont les pays traversés, ses veines
// vertes les débordements de Genève. Autour d'elle, une aura qui ne s'arrête jamais : des nappes de couleur qui
// tournent lentement et un grain vert qui respire.
const GS = 900, DEPTH = 0.92 * GS / 2;
export const GREEN = [0.24, 0.92, 0.59];
// Forme neutre : le dôme. C'est celle de l'accueil, de l'attente et du début de chaque session.
export const PLAIN = { amp: 8, freq: 3, dens: 0.9, split: 0, gap: 0, rig: 1, sx: 1, sy: 1, crest: 0, sharp: 1, k: 10, lobes: 0, horns: 0, eGap: 0.27, eSize: 1, eOpen: 0.75, eAsym: 0, veins: 0, over: 0,
  aPulse: 0.5, aWrap: 0.6, aReach: 0.4, aSpeed: 1, aHush: 0, aWaves: 0, aSpark: 0, aCross: 0 };

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
// Le souffle de l'aura, partagé par la scène et par les pages publiques : elle bat régulièrement si le trio a tenu
// ensemble, et elle retient son souffle autant de fois qu'il a su se taire.
export function auraBreath(f, t) {
  const beat = 0.5 + 0.5 * Math.sin(t * 5.2), pulse = 1 + f.aPulse * (1.1 * beat ** 3 - 0.3);
  const hold = f.aHush > 0 ? 1 - 0.85 * Math.max(0, Math.sin(t * 6.2832 / (13 - 2 * f.aHush))) ** 10 : 1;
  return pulse * hold;
}
// L'aura dit quelque chose de la créature, dans la matière de l'univers : un halo discret et une brume de grain fin,
// jamais de rideaux de couleur. La brume bat (ils ont tenu ensemble) ou erre (ils ont cherché) ; elle reste contre elle
// (ils se sont fait de la place) ou file haut en mèches séparées (chacun sa voix) ; elle s'ouvre large (ils sont allés
// vers l'autre) ; elle retient son souffle (leurs silences), une onde de grain part d'elle pour chaque débordement,
// des étincelles bondissent (leurs sauts).
export function drawAura(c, w, ground, cx, cy, R, colors, t, strength = 1, f = PLAIN, grains = 1500) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const cols = [...colors, GREEN], n = cols.length, tt = t * f.aSpeed, wrap = f.aWrap, stray = 1 - f.aPulse, breath = auraBreath(f, t), k0 = strength * (0.75 + 0.25 * breath);
  // Le halo, doux et rond, qui tourne lentement autour d'elle.
  for (let k = 0; k < n; k++) {
    const a = tt * (0.11 + 0.023 * k) * (k % 2 ? -1 : 1) + k * 2.4, d = R * (0.35 + 0.3 * Math.sin(tt * 0.17 + k * 1.3)) * (1.25 - 0.45 * wrap);
    const x = cx + d * Math.cos(a) * 1.25, y = cy - R * 0.55 + d * Math.sin(a) * 0.6, rad = R * (1.05 + 0.3 * Math.sin(tt * 0.23 + k * 2));
    const gd = c.createRadialGradient(x, y, 0, x, y, rad);
    gd.addColorStop(0, css(cols[k], 0.17 * k0)); gd.addColorStop(0.5, css(cols[k], 0.06 * k0)); gd.addColorStop(1, css(cols[k], 0));
    c.fillStyle = gd; c.fillRect(0, 0, w, ground);
  }
  // La brume de grain : des mèches fines qui montent de son dos.
  let sd = 29;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const px = Math.max(1, R / 260), rise = R * (0.7 + 1.5 * (1 - 0.6 * wrap)), open = R * (0.15 + 1.1 * f.aReach), g = strength * breath;
  for (let i = 0; i < grains; i++) {
    const u = rnd(), sp = 0.035 + 0.05 * rnd(), ph = rnd(), jit = rnd(), bright = rnd(), tint = rnd(), sz = rnd();
    const p = (tt * sp + ph) % 1, th = Math.PI * (1.04 + 0.92 * u), cs = Math.cos(th);
    // les mèches : des bandes qui glissent lentement le long du dos, nettes si le battement a tenu
    const lock = (0.5 + 0.5 * Math.sin(u * (16 + 10 * (1 - wrap)) + tt * 0.22 + 1.5 * stray * Math.sin(tt * 0.4 + p * 4))) ** (1.5 + 2 * f.aPulse);
    const al = Math.sin(Math.PI * p) ** 0.7 * (0.12 + 0.88 * lock) * (0.25 + 0.75 * bright) * 0.55 * g;
    if (al < 0.02) continue;
    const x = cx + R * f.sx * cs * (1 + 0.1 * jit) + open * p * cs * (1 - 2.2 * f.aCross * p)
      + R * 0.16 * stray * p * Math.sin(tt * 0.7 + u * 9 + p * 5) + R * 0.1 * wrap * Math.sin(p * 5 + u * 20 + tt * 0.3);
    const y = cy + R * f.sy * Math.sin(th) * (1 + 0.1 * jit) - rise * p * (0.5 + 0.5 * jit);
    if (y > ground) continue;
    const col = tint < 0.22 ? cols[(i % n)] : null, s = px * (0.8 + 1.3 * sz);
    c.fillStyle = col ? css([0.5 * col[0] + 0.3, 0.5 * col[1] + 0.4, 0.5 * col[2] + 0.35], al) : `rgba(${(70 + 110 * tint) | 0},225,${(150 + 60 * tint) | 0},${al})`;
    c.fillRect(x, y, s, s);
  }
  // Une onde de grain par débordement : Genève qui déborde encore.
  if (f.aWaves >= 0.5) {
    const every = 15 / Math.min(6, f.aWaves) + 1.5, p = (t % every) / 3;
    if (p < 1) {
      const m = Math.min(900, grains * 0.6), rr = 1 + 1.4 * p ** 0.7, fade = (1 - p) ** 1.3 * strength;
      for (let i = 0; i < m; i++) {
        const th = Math.PI * (1 + rnd()), off = (rnd() + rnd() - 1) * (0.05 + 0.22 * p), a = fade * (0.3 + 0.6 * rnd()) * (1 - Math.abs(off) / (0.05 + 0.22 * p)), s = px * (0.8 + 1.2 * rnd());
        c.fillStyle = `rgba(90,235,170,${a})`;
        c.fillRect(cx + R * f.sx * (rr + off) * Math.cos(th), cy + R * f.sy * (rr + off) * Math.sin(th), s, s);
      }
    }
  }
  // Leurs sauts : des étincelles qui bondissent de son dos.
  const sparks = Math.round(14 * f.aSpark);
  for (let k = 0; k < sparks; k++) {
    const p = (t * (0.45 + 0.05 * (k % 4)) + k * 0.277) % 1, th = Math.PI * (1.12 + 0.76 * ((k * 0.618) % 1)), hop = Math.sin(Math.PI * p) * R * (0.25 + 0.3 * ((k * 0.37) % 1));
    const x = cx + R * f.sx * Math.cos(th) * 1.02, y = cy + R * f.sy * Math.sin(th) - hop, s = Math.max(1.5, R * 0.012);
    if (y < ground) { c.fillStyle = css([0.85, 1, 0.9], 0.9 * Math.sin(Math.PI * p)); c.fillRect(x, y, s, s); }
  }
  c.restore();
}
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
// wide (0 à 1) : elle écarquille les yeux ; look (-1 à 1) : elle regarde d'un côté.
export function drawEyes(c, ground, cx, R, f, open, wide = 0, look = 0) {
  if (open <= 0.01) return;
  for (const side of [-1, 1]) {
    const er = R * 0.075 * f.eSize * (side > 0 ? 1 + f.eAsym : 1 - f.eAsym * 0.4) * (1 + 0.38 * wide), ex = cx + side * R * f.sx * f.eGap + look * R * 0.035, op = open * (f.eOpen + (1.25 - f.eOpen) * wide) / 0.75;
    c.save();
    c.beginPath(); c.rect(ex - er * 2, ground - er * 0.8 * Math.min(1.7, op), er * 4, er * 1.7); c.clip();
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
  if (o.aura) drawAura(c, w, ground, cx, cy, R, o.aura, o.t || 0, o.auraStrength ?? 1, f);
  drawDust(c, ground, cx, cy, R, f, o.t || 0, o.glow, o.flood || 0);
  // Vivante : elle se balance à peine, le pied au sol, et respire.
  const life = o.life || 0, t = o.t || 0;
  if (life > 0) { c.save(); alive(c, cx, ground, t, life); }
  drawBody(c, cx, cy, R, f, o.glow, o.beat);
  if (life > 0) c.restore();
  drawEyes(c, ground, cx, R, f, o.eyes, o.wide || 0, o.look || 0);
}
// Balancement et souffle autour du point d'appui au sol.
export function alive(c, cx, ground, t, k = 1) {
  const sway = 0.02 * k * Math.sin(t * 0.55) + 0.008 * k * Math.sin(t * 1.3 + 1), br = 1 + 0.022 * k * Math.sin(t * 0.9);
  c.translate(cx, ground); c.transform(1, 0, -sway, 1, 0, 0); c.scale(1 / Math.sqrt(br), br); c.translate(-cx, -ground);
}
// Le regard d'une créature au repos : de temps en temps elle écarquille les yeux, puis regarde ailleurs.
export class Gaze {
  constructor(seed = 1) { this.wide = 0; this.look = 0; this.to = 0; this.blink = 0; this.nextWide = 2 + (seed * 1.37) % 4; this.nextBlink = 1.5 + (seed * 0.77) % 3; this.nextLook = 1 + (seed * 2.1) % 3; this.hold = 0; }
  step(dt) {
    this.nextWide -= dt; this.nextBlink -= dt; this.nextLook -= dt;
    if (this.nextWide < 0) { this.hold = 1.1 + Math.random() * 0.9; this.nextWide = 5 + Math.random() * 6; }
    if (this.nextBlink < 0) { this.blink = 1; this.nextBlink = 2.2 + Math.random() * 4; }
    if (this.nextLook < 0) { this.to = (Math.random() * 2 - 1) * (Math.random() < 0.35 ? 0 : 1); this.nextLook = 1.8 + Math.random() * 3.5; }
    this.hold = Math.max(0, this.hold - dt);
    this.wide += ((this.hold > 0 ? 1 : 0) - this.wide) * Math.min(1, dt * (this.hold > 0 ? 9 : 2.5));
    this.look += (this.to - this.look) * Math.min(1, dt * 3);
    this.blink = Math.max(0, this.blink - dt * 6);
  }
}

// Une créature vivante dans un petit cadre (galerie, page d'une créature) : son corps est dessiné une fois pour
// toutes, puis seuls l'aura, le grain, un léger souffle et le clignement des lueurs sont rejoués à chaque image.
export class Living {
  constructor(el, item, { dust = 900 } = {}) {
    this.el = el; this.item = item; this.dust = dust; this.phase = (item.n || 1) * 1.7; this.gaze = new Gaze(item.n || 1);
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
    this.gaze.step(dt);
    c.clearRect(0, 0, w, h);
    drawAura(c, w, h, cx, cy, R, this.colors, tt, 1.7, f, Math.round(this.dust * 2.4));
    drawDust(c, h, cx, cy, R, f, tt, 1, 0, this.dust);
    // L'aura se fond dans le noir de la page : aucun bord de cadre visible.
    c.save(); c.globalCompositeOperation = 'destination-in';
    let g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.16, '#000'); g.addColorStop(0.84, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.22, '#000');
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
    c.save(); alive(c, cx, h, tt, 1);
    c.drawImage(this.body, 0, 0);
    c.restore();
    drawEyes(c, h, cx, R, f, 1 - this.gaze.blink, this.gaze.wide, this.gaze.look);
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
