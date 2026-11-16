// Le voyage : Genève déborde sur le monde.
// Tous les trios font le même voyage : départ de Genève, trois pays d'environ une minute, retour à Genève.
// Ce que le trio gagne, c'est ce que Genève laisse en route : quand il lève les mains ensemble, Genève déborde
// (la lumière verte inonde l'écran, une veine verte s'ajoute à la créature).
// La créature finale prend la forme de leur façon de jouer ensemble, lue selon trois axes jamais nommés à
// l'écran : tenir ensemble (rigueur), se faire de la place (compassion), aller vers l'autre (ouverture).
import { state, settings, clamp, smooth } from './state.js';
import { PRESETS } from './music.js';
import { applyPreset } from './ui.js';
import { portrait } from './creature.js';
import { slots } from './pose.js';
import { splat } from './capture.js';
import { GW, GH } from './state.js';
import { PLAIN, auraBreath, auraTint } from './creature-draw.js';
import { formOf, describe, whoOf, encode, decode } from './portrait.js';

const GKEY = 'foule-sonore-galerie', TOUR = ['mali', 'levant', 'inde', 'japon', 'caraibes'], MAX_ITEMS = 48, STOPS = 3;
export const gallery = { n: 0, items: [], version: 0 };
try { const g = JSON.parse(localStorage.getItem(GKEY) || '{}'); gallery.n = g.n | 0; if (Array.isArray(g.items)) gallery.items = g.items; } catch { /* stockage indisponible */ }
function save() {
  for (let tries = 0; tries < 4; tries++) {
    try { localStorage.setItem(GKEY, JSON.stringify({ n: gallery.n, items: gallery.items })); return; }
    catch { gallery.items.splice(0, Math.ceil(gallery.items.length / 4) || 1); }      // plus de place : les plus anciennes s'effacent
  }
}

const J = state.journey, W = state.who;
const ink = (id) => PRESETS[id]?.ink || PRESETS.geneve.ink;
let A = null;          // ce que l'on retient de la session en cours

function openBand(id) {
  J.bands.push({ id, color: ink(id), time: 0, w: 0.02 });
  J.cur = id; J.t = 0;
}
function begin() {
  const k = (gallery.n * STOPS) % TOUR.length, d = state.drama;
  Object.assign(J, { bands: [], cur: '', t: 0, route: [...TOUR.slice(k), ...TOUR.slice(0, k)], idx: 0, maxN: 0, drops: d.drops, overflows: 0, traits: null, form: null, done: 0 });
  A = { T: 0, e: 0, open: 0, tog: 0, early: [0, 0], late: [0, 0], share: new Map(), first: new Map(), firsts: 0, await: true,
    hush0: d.hushEnds, jumps0: W.jumps, swaps0: W.swaps, startN: 0, startT: 0 };
  W.visited.clear();                     // nouvelle session : chacun repart de la place où il se tient
  slots.forEach((sl, i) => { if (sl.on && sl.pid) W.visited.set(sl.pid, new Set([i])); });
  if (settings.journey && settings.preset !== 'geneve') applyPreset('geneve');
}
const pidAt = (i) => slots[i]?.pid || 0;

function next() { applyPreset(J.route[J.idx++ % J.route.length] || 'mali'); J.t = 0; }
// Depuis la régie : pays suivant, tout de suite.
export function nextStop() {
  if (state.session.on && state.session.ended === 0 && J.route.length) next();
  else { const ids = Object.keys(PRESETS); applyPreset(ids[(ids.indexOf(settings.preset) + 1) % ids.length]); }
}
// Genève déborde : depuis le geste collectif, ou depuis la régie.
export function overflow() {
  if (!state.session.on || state.session.ended > 0) return;
  J.overflows++; state.flood = 1;
}

// ---------- Ce que la session dit du trio ----------
function traits() {
  const d = state.drama, T = Math.max(1, A.T), hushes = d.hushEnds - A.hush0, swaps = W.swaps - A.swaps0, jumps = W.jumps - A.jumps0;
  const shares = [...A.share.values()].filter((v) => v > T * 0.01), k = shares.length, sum = shares.reduce((a, b) => a + b, 0) || 1;
  const bal = k >= 2 ? 1 - (Math.max(...shares) / sum - 1 / k) / (1 - 1 / k) : 0.5;
  const together = A.tog / T, early = A.early[1] ? A.early[0] / A.early[1] : together, late = A.late[1] ? A.late[0] / A.late[1] : together;
  let leader = 0;
  for (const v of A.first.values()) if (A.firsts >= 2 && v === A.firsts) leader = 1;
  const people = [...W.visited.entries()].filter(([pid]) => A.share.has(pid));
  return {
    r: clamp(0.12 + 0.62 * together + 0.26 * Math.min(1, (J.overflows + hushes) / 4)),      // tenir ensemble
    c: clamp(0.12 + 0.62 * bal + 0.26 * Math.min(1, hushes / 2)),                           // se faire de la place
    o: clamp(0.1 + 0.5 * Math.min(1, (A.open / T) * 2.2) + 0.4 * Math.min(1, swaps / 5)),   // aller vers l'autre
    e: clamp((A.e / T) * 1.7), n: Math.max(1, J.maxN), startN: A.startN || J.maxN, hushes, swaps, jumps, overflows: J.overflows,
    early, late, leader, allPlaces: people.length >= 2 && people.every(([, set]) => set.size >= 3),
  };
}
function finish() {
  const n = ++gallery.n, now = new Date(), group = settings.mode === 'group';
  const at = `${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}`;
  // Tout passe par le code de la créature : ce que la scène affiche est exactement ce que son lien affichera.
  const code = encode(n, at, group, traits(), J.bands), c = decode(code);
  J.traits = c.traits; J.form = c.form; J.done = 1;
  let img = '';
  try { img = portrait(480, 288).toDataURL('image/jpeg', 0.82); } catch { /* portrait indisponible */ }
  const item = { n, at, who: whoOf(c.traits.n, group), nick: c.nick, text: c.text, img, code };
  J.last = item;
  gallery.items.push(item); if (gallery.items.length > MAX_ITEMS) gallery.items.shift();
  save(); gallery.version++;
  handlers.onCreature?.(item);
}
const handlers = {};
export function onCreature(fn) { handlers.onCreature = fn; }
export function clearGallery() { gallery.items = []; gallery.n = 0; gallery.version++; save(); }

export function update(dt) {
  const ss = state.session, d = state.drama, m = state.m;
  // Couleur de la scène : celle du pays, noyée de vert quand Genève déborde.
  state.flood = Math.max(0, state.flood - dt / 4.5);
  // À la présentation, la brume prend la couleur de la créature : le pays où le trio a joué le plus fort.
  const target = state.session.ended > 0 && J.done ? auraTint(J.bands) : ink(settings.preset), g = PRESETS.geneve.ink, f = state.flood ** 0.6;
  for (let k = 0; k < 3; k++) state.ink[k] = smooth(state.ink[k], target[k] + (g[k] - target[k]) * f, dt, state.flood > 0.02 ? 0.18 : 0.9);

  if (ss.on && !J.wasOn && ss.ended === 0) begin();
  J.wasOn = ss.on;
  if (!ss.on) { if (J.bands.length) { J.bands = []; J.cur = ''; J.form = null; J.done = 0; A = null; } return; }
  if (ss.ended > 0) {
    if (ss.ends !== J.ends && A) { J.ends = ss.ends; finish(); }
    // Présentation de la créature : la brume ne dépend plus des joueurs, elle prend le tempérament du trio.
    // Elle bat ou elle erre, elle enveloppe la créature ou monte en trois colonnes, elle s'ouvre plus ou moins large,
    // elle retient son souffle, et une onde part d'elle pour chaque débordement.
    const t = performance.now() / 1000, f = { ...PLAIN, ...(J.form || {}) }, tt = t * f.aSpeed, k0 = auraBreath(f, t), reach = 0.55 + 0.9 * f.aReach, stray = 1 - f.aPulse;
    for (let k = 0; k < 7; k++) {
      const a = tt * (0.22 + 0.03 * k) * (k % 2 ? -1 : 1) + k * 0.9, rad = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(tt * 0.13 + k * 1.7));
      const xo = 0.5 + rad * Math.cos(a) * 1.5, yo = 0.55 - 0.15 * Math.sin(tt * 0.11 + k) + rad * Math.sin(a) * 0.5;      // autour d'elle
      const col = k % 3, xs = 0.5 + (col - 1) * 0.3 * reach + 0.05 * stray * Math.sin(tt * 0.4 + k * 3), ys = 0.25 + 0.6 * ((tt * 0.07 + k * 0.37) % 1);   // une colonne par place
      const x = xs + (xo - xs) * f.aWrap, y = ys + (yo - ys) * f.aWrap;
      const swirl = f.aWrap * 4.5, cross = f.aCross * 3 * (1 - col) * (k % 2 ? 1 : 0.4);
      splat(GW * x, GH * y, (-Math.sin(a) * swirl + cross + 3 * stray * Math.sin(tt * 0.3 + k * 2)) * k0, (-2.4 - 2.6 * (1 - f.aWrap) - 1.6 * Math.abs(Math.cos(a))) * f.aSpeed * k0, 3.4);
    }
    if (f.aWaves >= 0.5) {
      const every = 15 / Math.min(6, f.aWaves) + 1.5, p = (t % every) / 1.2;
      if (p < 1) for (let k = 0; k < 9; k++) { const a = Math.PI * (1 + k / 8), r = 0.16 + 0.2 * p; splat(GW * (0.5 + r * Math.cos(a)), GH * (0.92 + r * 1.7 * Math.sin(a)), Math.cos(a) * 9 * (1 - p), Math.sin(a) * 9 * (1 - p), 3); }
    }
    return;
  }
  J.ends = ss.ends;
  if (!A) begin();

  if (settings.preset !== J.cur) openBand(settings.preset);
  const b = J.bands[J.bands.length - 1];
  b.time += dt; b.w = Math.max(0.02, clamp(b.time / 4) ** 2 * (0.5 + Math.min(1.5, b.time / 45)));
  J.t += dt;

  // Mesures de la session, seulement quand il se passe quelque chose.
  let n = 0, on = 0, op = 0;
  const starters = [];
  if (settings.mode === 'group') settings.sectors.forEach((s, i) => {
    if (!s.present) return;
    const q = state.sec[i], pid = pidAt(i) || i + 1;
    n++; op += q.open; if (q.on) on++;
    A.share.set(pid, (A.share.get(pid) || 0) + q.energy * dt);
    if (q.on) starters.push(pid);
  });
  // Qui relance après un silence tenu ensemble ? Ne compte que si une seule personne repart avant les autres.
  if (d.hush) A.await = true;
  else if (A.await && starters.length) { A.await = false; A.firsts++; if (starters.length === 1) A.first.set(starters[0], (A.first.get(starters[0]) || 0) + 1); }
  J.maxN = Math.max(J.maxN, n);
  if (!A.startN && ss.t > 6) A.startN = n;
  if (!d.attract && n > 0) {
    const all = n >= 2 && on === n ? 1 : 0, dur = settings.sessionMin * 60 || 300, ph = ss.t / dur;
    A.T += dt; A.e += m.energy * dt; A.open += (op / n) * dt; A.tog += all * dt;
    if (ph < 0.4) { A.early[0] += all * dt; A.early[1] += dt; } else if (ph > 0.6) { A.late[0] += all * dt; A.late[1] += dt; }
  }
  J.traits = traits(); J.form = formOf(J.traits);

  if (d.drops !== J.drops) { J.drops = d.drops; overflow(); }       // mains levées ensemble : Genève déborde
  if (!settings.journey) return;
  // Le même voyage pour tous : Genève, trois pays, Genève.
  const dur = settings.sessionMin * 60;
  if (!dur) { if (J.t > 70) next(); return; }
  const back = dur - 35, start = Math.min(55, dur * 0.2), leg = (back - start) / STOPS;
  const want = ss.t >= back ? -1 : ss.t < start ? 0 : 1 + Math.min(STOPS - 1, Math.floor((ss.t - start) / leg));
  if (want === -1) { if (settings.preset !== 'geneve') applyPreset('geneve'); }
  else if (want > J.idx) next();
}

// Toutes les créatures de la soirée en une image, à télécharger depuis l'ordinateur de scène.
export async function exportGallery() {
  const items = gallery.items;
  if (!items.length) return false;
  const cols = Math.min(4, Math.ceil(Math.sqrt(items.length))), rows = Math.ceil(items.length / cols), cw = 480, ch = 288, cap = 150, pad = 60;
  const c = document.createElement('canvas'); c.width = cols * (cw + 30) + 2 * pad; c.height = rows * (ch + cap) + 2 * pad + 70;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.textBaseline = 'top'; g.font = '400 30px Anton, Impact, sans-serif';
  g.fillText('LES CRÉATURES DE L\'ASSEMBLÉE CRÉATIVE DE GENÈVE · 19 NOVEMBRE 2026', pad, pad - 10);
  await Promise.all(items.map((it, i) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => {
      const x = pad + (i % cols) * (cw + 30), y = pad + 70 + Math.floor(i / cols) * (ch + cap);
      g.drawImage(im, x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = '400 19px Anton, Impact, sans-serif'; g.fillText(`CRÉATURE N° ${it.n}${it.nick ? ', ' + it.nick.toUpperCase() : ''}`, x + 8, y + ch + 8);
      g.fillStyle = '#888'; g.font = '12px Helvetica, Arial, sans-serif'; g.fillText(`née à ${it.at} ${it.who}`, x + 8, y + ch + 36);
      ok();
    };
    im.onerror = ok; im.src = it.img;
  })));
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'creatures-assemblee-creative.png'; a.click();
  return true;
}
