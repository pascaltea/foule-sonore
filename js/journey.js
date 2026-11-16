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
// La forme de la créature. Tenir ensemble : strates droites, contour net. Se faire de la place : une seule masse,
// lueurs proches. Aller vers l'autre : largeur, grain qui sort du contour. Sauts : cornes. Débordements : veines.
export function formOf(t) {
  const hn = Math.min(3, Math.floor(t.jumps / 3));
  return {
    amp: 3 + 42 * (1 - t.r), freq: 1.4 + 5 * t.e, dens: 0.5 + 0.5 * t.e, split: (1 - t.r) ** 1.6 * (1 - t.c * 0.5), gap: t.hushes >= 2 ? 2 : 0, rig: t.r,
    sx: 0.74 + 0.7 * t.o, sy: 1.2 - 0.46 * t.o, crest: 0.13 * (1 - t.c) * (0.4 + 0.6 * t.e) + 0.03 * (1 - t.r), sharp: 0.4 + 1.2 * t.r, k: 6 + 10 * t.e,
    lobes: 0.3 * (1 - t.c) ** 1.5, horns: hn, eGap: 0.13 + 0.34 * (1 - t.c), eSize: 0.65 + 1.1 * t.o, eOpen: 0.3 + 0.7 * t.e, eAsym: 0.3 * (1 - t.r) * (t.e > 0.5 ? 1 : 0),
    veins: Math.min(6, t.overflows), over: t.o * Math.min(1, t.overflows / 3 + 0.15),
  };
}

// ---------- Surnoms et portraits ----------
// Toutes les phrases affichées sont ici. Le portrait s'adresse au trio. Aucune ne juge : chacune dit un fait.
const NB = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];
const nb = (n) => NB[n] || String(n);
export const TEXTS = {
  seul: 'Vous étiez seul, et vous avez tenu toute la scène sans jamais la laisser retomber.',
  foule: 'Vous étiez nombreux, et vous avez joué comme un seul corps.',
  accordee: 'Vous avez commencé chacun de votre côté, puis quelque chose s\'est calé et vous ne vous êtes plus quittés.',
  patiente: 'Le début a été un joyeux brouillon. Puis vous vous êtes attendus, et la fin est d\'un seul geste.',
  tenu: 'Un battement s\'est posé très tôt, et aucun de vous ne l\'a lâché.',
  confidence: 'Vous avez joué bas, presque en confidence, sans jamais vous couvrir.',
  place: 'Aucun de vous n\'a pris toute la place. Vous vous êtes laissé jouer.',
  voix: 'Autant de façons de jouer que de joueurs, et aucune n\'a cédé. Vous ne vous êtes pas suivis, vous vous êtes répondus.',
  cherche: 'Vous avez cherché l\'accord jusqu\'au bout, sans jamais arrêter de chercher.',
  defaut: 'Vous vous êtes cherchés, et souvent trouvés.',
  accueil: 'Quand un de plus est monté, vous lui avez fait de la place sans rien arrêter.',
  places: 'Chacun de vous a tenu les trois places.',
  echanges: (n) => `Vous avez échangé vos places ${nb(n)} fois : ce que l'un commençait, un autre le finissait.`,
  premier: 'L\'un de vous partait toujours le premier. Les autres l\'ont rejoint à chaque fois.',
  silences: (n) => `${nb(n)[0].toUpperCase() + nb(n).slice(1)} silences tenus ensemble : c'est rare.`,
  sauts: (n) => `Vous avez sauté ${nb(n)} fois sans perdre le fil.`,
  bras: 'Vous avez ouvert les bras avant même de savoir quoi jouer.',
  deborde: (n) => (n === 1 ? 'Genève a débordé une fois.' : `Genève a débordé ${nb(n)} fois.`),
};
function describe(t, group) {
  if (!group) return { nick: 'la Multitude', text: TEXTS.foule };
  if (t.n <= 1) return { nick: 'la Solitaire', text: TEXTS.seul };
  const joined = t.startN < t.n, patient = t.late - t.early > 0.25 && t.late > 0.55;
  const nick = joined ? 'l\'Hospitalière' : t.allPlaces && t.swaps >= 5 ? 'la Passeuse' : t.r > 0.7 && t.c > 0.7 && t.o > 0.6 ? 'l\'Accordée' : patient ? 'la Patiente'
    : t.jumps >= 6 && t.r > 0.55 ? 'la Funambule' : t.overflows >= 4 ? 'la Débordante' : t.leader ? 'l\'Éclaireuse' : t.r > 0.75 ? 'l\'Horlogère'
      : t.c > 0.78 && t.e < 0.3 ? 'la Veilleuse' : t.c > 0.78 ? 'la Généreuse' : t.c < 0.38 ? 'la Polyphonique' : t.r < 0.35 ? 'la Chercheuse' : 'l\'Inattendue';
  const a = t.r > 0.7 && t.c > 0.7 && t.o > 0.6 ? TEXTS.accordee : patient ? TEXTS.patiente : t.r > 0.75 ? TEXTS.tenu : t.c > 0.78 && t.e < 0.3 ? TEXTS.confidence
    : t.c > 0.78 ? TEXTS.place : t.c < 0.38 ? TEXTS.voix : t.r < 0.35 ? TEXTS.cherche : TEXTS.defaut;
  const facts = [];
  if (joined) facts.push(TEXTS.accueil);
  if (t.allPlaces && t.n >= 3) facts.push(TEXTS.places); else if (t.swaps >= 4) facts.push(TEXTS.echanges(t.swaps));
  if (t.leader) facts.push(TEXTS.premier);
  if (t.hushes >= 2) facts.push(TEXTS.silences(t.hushes));
  if (t.jumps >= 6) facts.push(TEXTS.sauts(t.jumps));
  if (t.o > 0.75 && !facts.length) facts.push(TEXTS.bras);
  const out = [a, ...facts.slice(0, 2)];
  if (t.overflows >= 1) out.push(TEXTS.deborde(t.overflows));
  return { nick, text: out.join(' ') };
}

function finish() {
  const n = ++gallery.n, now = new Date(), group = settings.mode === 'group';
  const t = traits(), who = !group ? 'd\'une foule' : t.n <= 1 ? 'd\'une personne seule' : `de ${['deux', 'trois', 'quatre', 'cinq'][Math.min(t.n, 5) - 2]} inconnus`;
  J.traits = t; J.form = formOf(t); J.done = 1;
  const { nick, text } = describe(t, group);
  let img = '';
  try { img = portrait(480, 288).toDataURL('image/jpeg', 0.82); } catch { /* portrait indisponible */ }
  const item = { n, at: `${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}`, who, nick, text, img };
  J.last = item;
  if (img) { gallery.items.push(item); if (gallery.items.length > MAX_ITEMS) gallery.items.shift(); }
  save(); gallery.version++;
}
export function clearGallery() { gallery.items = []; gallery.n = 0; gallery.version++; save(); }

export function update(dt) {
  const ss = state.session, d = state.drama, m = state.m;
  // Couleur de la scène : celle du pays, noyée de vert quand Genève déborde.
  state.flood = Math.max(0, state.flood - dt / 4.5);
  const target = ink(settings.preset), g = PRESETS.geneve.ink, f = state.flood ** 0.6;
  for (let k = 0; k < 3; k++) state.ink[k] = smooth(state.ink[k], target[k] + (g[k] - target[k]) * f, dt, state.flood > 0.02 ? 0.18 : 0.9);

  if (ss.on && !J.wasOn && ss.ended === 0) begin();
  J.wasOn = ss.on;
  if (!ss.on) { if (J.bands.length) { J.bands = []; J.cur = ''; J.form = null; J.done = 0; A = null; } return; }
  if (ss.ended > 0) { if (ss.ends !== J.ends && A) { J.ends = ss.ends; finish(); } return; }
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
      g.fillStyle = '#ccc'; g.font = '14px Helvetica, Arial, sans-serif';
      let line = '', ly = y + ch + 58;
      for (const w of (it.text || '').split(' ')) { if (g.measureText(line + w).width > cw - 16) { g.fillText(line.trim(), x + 8, ly); ly += 19; line = ''; } line += w + ' '; }
      g.fillText(line.trim(), x + 8, ly);
      ok();
    };
    im.onerror = ok; im.src = it.img;
  })));
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'creatures-assemblee-creative.png'; a.click();
  return true;
}
