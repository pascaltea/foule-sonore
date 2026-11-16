// La Créature de l'Assemblée créative de Genève, telle que dessinée sur l'affiche : l'image d'origine est affichée
// sans retouche (recadrage de l'affiche, bords fondus dans le noir). Seuls ses yeux sont animés : paupières,
// regard, et l'iris d'origine qui se déplace dans le blanc de l'oeil.
// Elle incarne la jauge collective. Au repos elle dort ; plus on joue ensemble, plus elle ouvre les yeux et
// sort de l'ombre ; au climax elle est bien réveillée et la scène rayonne. Elle regarde qui joue le plus.
import { GW, MAX_SECTORS, state, settings, clamp, smooth } from './state.js';

// Géométrie relevée sur l'image (tools/build_creature.py), en pixels de img/creature.jpg.
// icx, icy, ir : iris d'origine (centre posé sur la ligne du sol) ; top : haut du blanc de l'oeil ; lid : teinte du dôme autour.
const AW = 2400, AH = 1183;
const EYES = [
  { id: 'L', side: -1, x: 773, y: 894, w: 285, h: 155, icx: 147, icy: 138.8, ir: 44, top: 6, white: 'rgb(231,231,231)', lid: 'rgb(0,0,0)' },
  { id: 'R', side: 1, x: 1414, y: 870, w: 269, h: 172, icx: 136.5, icy: 149.5, ir: 44.5, top: 6, white: 'rgb(233,234,234)', lid: 'rgb(33,34,34)' },
];

let cv, g, W = 0, H = 0, ready = false, base = null, comp = null, cg = null;
let open = 0, lift = 0, lookX = 0, lookY = 0, light = 0.4, rays = 0, spin = 0, wide = 0;
let blinkIn = 3, blink = 0, peekIn = 5, peek = 0, lastAccent = 0, lastPlaying = 0;

const rgb = (hex) => { const h = parseInt(hex.slice(1), 16); return [h >> 16, (h >> 8) & 255, h & 255]; };
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const load = (name) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = new URL(`../img/${name}`, import.meta.url).href; });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function init(el) {
  cv = el; g = cv.getContext('2d');
  Promise.all([load('creature.jpg'), ...EYES.flatMap((e) => [load(`eye${e.id}-mask.png`), load(`iris${e.id}.png`)])]).then(([img, ...rest]) => {
    // Le dessin, avec ses bords fondus dans le noir de la scène (haut et côtés ; le bas touche le bord de l'écran).
    base = canvas(AW, AH);
    const b = base.getContext('2d');
    b.drawImage(img, 0, 0);
    b.globalCompositeOperation = 'destination-in';
    let gd = b.createLinearGradient(0, 0, AW, 0);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(0.15, '#000'); gd.addColorStop(0.85, '#000'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gd; b.fillRect(0, 0, AW, AH);
    gd = b.createLinearGradient(0, 0, 0, AH);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(0.16, '#000');
    b.fillStyle = gd; b.fillRect(0, 0, AW, AH);
    EYES.forEach((e, i) => { e.img = img; e.mask = rest[i * 2]; e.iris = rest[i * 2 + 1]; e.cv = canvas(e.w, e.h); e.g = e.cv.getContext('2d'); });
    comp = canvas(2, 2); cg = comp.getContext('2d');
    ready = true;
  }).catch(() => { /* image absente : l'expérience fonctionne sans la Créature */ });
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
}

// Un oeil : le dessin d'origine, l'iris d'origine déplacé, une paupière de la teinte du dôme. Rien ne déborde du blanc de l'oeil.
function drawEye(e, dx, dy, lid, tilt, scale) {
  const c = e.g, bottom = e.icy;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, e.w, e.h);
  c.drawImage(e.img, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
  c.fillStyle = e.white;                                     // le blanc de l'oeil reprend la place de l'iris d'origine
  c.beginPath(); c.arc(e.icx, e.icy, e.ir + 4, 0, 6.2832); c.fill();
  const s = e.iris.width * scale;
  c.drawImage(e.iris, e.icx + dx - s / 2, e.icy + dy - s / 2, s, s);
  if (lid < 0.995) {                                         // paupière : descend du haut de l'oeil vers le sol
    const y = e.top + (bottom + 6 - e.top) * (1 - lid), t = tilt * e.side * e.h * 0.16, sag = e.h * 0.1 * lid;
    c.fillStyle = e.lid;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, y + t); c.quadraticCurveTo(e.w / 2, y + sag * 2, e.w, y - t); c.lineTo(e.w, 0); c.closePath(); c.fill();
    c.lineWidth = 3; c.strokeStyle = '#000';
    c.beginPath(); c.moveTo(0, y + t); c.quadraticCurveTo(e.w / 2, y + sag * 2, e.w, y - t); c.stroke();
  }
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(e.mask, 0, 0);
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!ready || !settings.creature || !state.music.running) return;
  const d = state.drama, m = state.m, mu = state.music, S = settings.sectors;
  const climax = d.phase === 'climax', sleeping = d.attract;

  // Qui joue ? Le regard penche vers les plus actifs.
  let we = 0, wx = 0;
  for (let i = 0; i < Math.min(S.length, MAX_SECTORS); i++) {
    const s = S[i], q = state.sec[i];
    if (!q.on || s.present === false || !s.w) continue;
    const e = q.energy + 0.6 * q.pulse;
    we += e; wx += e * (s.x + s.w / 2) / GW;
  }
  // Endormie, elle entrouvre un oeil de temps en temps.
  peekIn -= dt;
  if (sleeping && peekIn < 0) { peek = 1.6; peekIn = 6 + Math.random() * 6; }
  peek = Math.max(0, peek - dt);
  const peeking = sleeping && peek > 0;
  // Sursaut quand quelqu'un de plus se met à jouer, ou sur un accent.
  if (m.playing > lastPlaying || mu.accentCount !== lastAccent) wide = 1;
  lastPlaying = m.playing; lastAccent = mu.accentCount;
  wide *= Math.exp(-dt * 2.2);
  blinkIn -= dt;
  if (blinkIn < 0 && !sleeping) { blink = 1; blinkIn = 2.5 + Math.random() * 4.5; }
  blink = Math.max(0, blink - dt * 7);

  const awake = sleeping ? 0 : climax ? 1 : clamp(0.3 + 0.75 * d.gauge + 0.2 * m.energy);
  open = smooth(open, sleeping ? (peeking ? 0.3 : 0) : clamp(awake + 0.3 * wide), dt, 0.25, 0.7);
  lift = smooth(lift, sleeping ? 0 : climax ? 1 : clamp(d.gauge * 1.25 + 0.25 * m.energy + 0.3 * wide), dt, 0.4, 0.9);
  lookX = smooth(lookX, sleeping ? (peeking ? Math.sin(t * 2.2) * 0.7 : 0) : we > 0.02 ? clamp((wx / we - 0.5) * 2.6, -1, 1) : 0, dt, 0.3);
  lookY = smooth(lookY, climax ? 0.12 * Math.sin(t * 7) : 0, dt, 0.2);
  light = smooth(light, sleeping ? 0.38 + 0.05 * Math.sin(t * 1.1) : climax ? 1 : 0.6 + 0.4 * clamp(d.gauge * 1.3), dt, 0.8, 1.6);
  rays = smooth(rays, climax ? 1 : d.tier >= 3 ? 0.4 : d.tier === 2 ? 0.14 : 0, dt, 0.5, 1.5);
  spin += dt * (0.03 + 0.12 * rays);

  const beat = mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const iw = Math.min(W * 0.68, H * 0.64 * AW / AH), ih = iw * AH / AW, k = iw / AW;
  const cx = W / 2, x0 = Math.round(cx - iw / 2), y0 = Math.round(H - ih);

  // Rayons (affiche « Rayonner ») : ils partent du sol, derrière la Créature, aux couleurs des trois places.
  if (rays > 0.01) {
    const N = 18, L = Math.hypot(W, H), cols = S.slice(0, 3).map((s) => rgb(s.color));
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI + ((i + (spin % 2)) / N) * Math.PI, a1 = a0 + Math.PI / N * 0.5;
      if (a0 > 2 * Math.PI) continue;
      const c = cols[i % cols.length] || [255, 255, 255];
      const gd = g.createRadialGradient(cx, H, iw * 0.2, cx, H, L * 0.8);
      gd.addColorStop(0, css(c, 0.5 * rays * (0.75 + 0.25 * beat))); gd.addColorStop(1, css(c, 0));
      g.fillStyle = gd;
      g.beginPath(); g.moveTo(cx, H); g.arc(cx, H, L, a0, Math.min(a1, 2 * Math.PI)); g.closePath(); g.fill();
    }
  }

  // Le dessin et ses yeux sont assemblés à part, puis posés sur la scène : au repos la Créature reste dans l'ombre.
  const cw = Math.round(iw), ch = Math.round(ih);
  if (comp.width !== cw || comp.height !== ch) { comp.width = cw; comp.height = ch; }
  cg.clearRect(0, 0, cw, ch);
  cg.drawImage(base, 0, 0, cw, ch);
  const lid = clamp(open * (1 - blink)), tilt = sleeping ? 0 : clamp(1 - d.gauge * 2.5) * (1 - wide);     // peu réveillée : paupières froncées
  for (const e of EYES) {
    const up = (e.icy - e.top - e.ir) * 0.72 * lift;
    drawEye(e, lookX * e.ir * (0.55 + 0.5 * lift), -up + lookY * e.ir * 0.3 - 0.12 * e.ir * beat * lift, lid, tilt, 1 + 0.1 * wide + (climax ? 0.06 * beat : 0));
    cg.drawImage(e.cv, e.x * k, e.y * k, e.w * k, e.h * k);
  }
  g.globalAlpha = clamp(light + 0.08 * beat);
  g.drawImage(comp, x0, y0);
  g.globalAlpha = 1;
}
