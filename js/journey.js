// Le voyage : Genève, aller-retour.
// La session part de Genève. Quand le trio lève les mains ensemble (la grande frappe), il change d'escale ; sans
// ce geste, l'escale change seule au bout de 75 s. Chaque escale laisse une strate sur le dôme, dont la forme
// dépend de la façon dont on y a joué. La dernière demi-minute ramène tout le monde à Genève, puis le dôme se
// fige : c'est la créature de ce trio, qui rejoint la galerie de la soirée.
import { state, settings, clamp, smooth } from './state.js';
import { PRESETS } from './music.js';
import { applyPreset } from './ui.js';
import { portrait } from './creature.js';

const GKEY = 'foule-sonore-galerie', TOUR = ['mali', 'levant', 'inde', 'japon', 'caraibes'], MAX_ITEMS = 48;
export const gallery = { n: 0, items: [], version: 0 };
try { const g = JSON.parse(localStorage.getItem(GKEY) || '{}'); gallery.n = g.n | 0; if (Array.isArray(g.items)) gallery.items = g.items; } catch { /* stockage indisponible */ }
function save() {
  for (let tries = 0; tries < 4; tries++) {
    try { localStorage.setItem(GKEY, JSON.stringify({ n: gallery.n, items: gallery.items })); return; }
    catch { gallery.items.splice(0, Math.ceil(gallery.items.length / 4) || 1); }      // plus de place : les plus anciennes s'effacent
  }
}

const J = state.journey;
const ink = (id) => PRESETS[id]?.ink || PRESETS.geneve.ink;

function openBand(id) {
  J.bands.push({ id, color: ink(id), time: 0, e: 0, sp: 0, op: 0, w: 0.02, amp: 8, freq: 3, phase: Math.random() * 6.283, dens: 0.6 });
  J.cur = id; J.t = 0;
}
function begin() {
  const k = gallery.n % TOUR.length;
  Object.assign(J, { bands: [], cur: '', t: 0, route: [...TOUR.slice(k), ...TOUR.slice(0, k)], idx: 0, maxN: 0, drops: state.drama.drops });   // chaque trio part dans un autre sens
  if (settings.journey && settings.preset !== 'geneve') applyPreset('geneve');
}
function next() { applyPreset(J.route[J.idx++ % J.route.length] || 'mali'); J.t = 0; }
// Depuis la régie : escale suivante, tout de suite.
export function nextStop() {
  if (state.session.on && state.session.ended === 0 && J.route.length) next();
  else { const ids = Object.keys(PRESETS); applyPreset(ids[(ids.indexOf(settings.preset) + 1) % ids.length]); }
}

function finish() {
  const n = ++gallery.n, now = new Date(), group = settings.mode === 'group';
  const who = !group ? 'd\'une foule' : J.maxN <= 1 ? 'd\'une personne seule' : `de ${['deux', 'trois', 'quatre', 'cinq'][Math.min(J.maxN, 5) - 2]} inconnus`;
  const stops = J.bands.map((b) => PRESETS[b.id]?.name || '').filter((s, i, a) => s && s !== a[i - 1]);
  let img = '';
  try { img = portrait(480, 288).toDataURL('image/jpeg', 0.82); } catch { /* portrait indisponible */ }
  const item = { n, at: `${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}`, who, stops, img };
  J.last = item;
  if (img) { gallery.items.push(item); if (gallery.items.length > MAX_ITEMS) gallery.items.shift(); }
  save(); gallery.version++;
}
export function clearGallery() { gallery.items = []; gallery.n = 0; gallery.version++; save(); }

export function update(dt) {
  const ss = state.session, d = state.drama, m = state.m;
  const target = ink(settings.preset);
  for (let k = 0; k < 3; k++) state.ink[k] = smooth(state.ink[k], target[k], dt, 0.9);

  if (ss.on && !J.wasOn && ss.ended === 0) begin();
  J.wasOn = ss.on;
  if (!ss.on) { if (J.bands.length) { J.bands = []; J.cur = ''; } return; }
  if (ss.ended > 0) { if (ss.ends !== J.ends) { J.ends = ss.ends; finish(); } return; }
  J.ends = ss.ends;

  if (settings.preset !== J.cur) openBand(settings.preset);
  // La strate de l'escale en cours prend forme : épaisse si l'on y reste et qu'on y joue fort, ondulée si l'on ouvre
  // les bras, serrée si les gestes sont vifs.
  const b = J.bands[J.bands.length - 1];
  let n = 0, op = 0;
  if (settings.mode === 'group') settings.sectors.forEach((s, i) => { if (s.present) { n++; op += state.sec[i].open; } });
  J.maxN = Math.max(J.maxN, n);
  b.time += dt; b.e += m.energy * dt; b.sp += m.speed * dt; b.op += (n ? op / n : 0.5) * dt;
  const avgE = b.e / b.time, grow = clamp(b.time / 3);
  b.w = Math.max(0.02, clamp(0.3 + b.time / 26 * (0.5 + avgE), 0.3, 3) * grow * grow);
  b.amp = 5 + 34 * (b.op / b.time); b.freq = 1.3 + 5.5 * (b.sp / b.time); b.dens = clamp(0.45 + 0.75 * avgE);
  J.t += dt;

  if (!settings.journey) { J.drops = d.drops; return; }
  const dur = settings.sessionMin * 60;
  if (dur && dur - ss.t < 35) { if (settings.preset !== 'geneve') applyPreset('geneve'); J.drops = d.drops; return; }   // retour à Genève
  if (d.drops !== J.drops) { J.drops = d.drops; if (J.t > 8) next(); }           // mains levées ensemble : on part
  else if (J.t > 75) next();                                                       // personne ne donne le signal : on part quand même
}

// Toutes les créatures de la soirée en une image, à télécharger depuis l'ordinateur de scène.
export async function exportGallery() {
  const items = gallery.items;
  if (!items.length) return false;
  const cols = Math.min(6, Math.ceil(Math.sqrt(items.length * 1.6))), rows = Math.ceil(items.length / cols), cw = 480, ch = 288, cap = 54, pad = 60;
  const c = document.createElement('canvas'); c.width = cols * cw + 2 * pad; c.height = rows * (ch + cap) + 2 * pad + 70;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.textBaseline = 'top'; g.font = '400 30px Anton, Impact, sans-serif';
  g.fillText('LES CRÉATURES DE L\'ASSEMBLÉE CRÉATIVE DE GENÈVE · 19 NOVEMBRE 2026', pad, pad - 10);
  await Promise.all(items.map((it, i) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => {
      const x = pad + (i % cols) * cw, y = pad + 70 + Math.floor(i / cols) * (ch + cap);
      g.drawImage(im, x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = '400 17px Anton, Impact, sans-serif'; g.fillText(`CRÉATURE N° ${it.n}`, x + 12, y + ch + 6);
      g.fillStyle = '#aaa'; g.font = '13px Helvetica, Arial, sans-serif'; g.fillText(`née à ${it.at} ${it.who} · ${it.stops.join(', ')}`.slice(0, 64), x + 12, y + ch + 30);
      ok();
    };
    im.onerror = ok; im.src = it.img;
  })));
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'creatures-assemblee-creative.png'; a.click();
  return true;
}
