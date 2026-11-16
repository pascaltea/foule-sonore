// Régie : panneau de réglages, éditeur de secteurs, raccourcis clavier, jauge, affichage debug.
import { GW, GH, GN, MAX_SECTORS, SECTOR_COLORS, ZONES, LAYOUTS, makeLayout, sanitizeSectors, rebuildSectorMap,
  state, settings, saveSettings, clamp, setMode, configOf, setConfig, sanitizePlayers, playersConfig, trio } from './state.js';
import { SCALES, KEYS, INSTRUMENTS, PRESETS } from './music.js';
import { endSession, newSession } from './metrics.js';
import { setNet, netInfo, regieUrl } from './remote.js';
import { gallery, nextStop, overflow, exportGallery, clearGallery } from './journey.js';
import { PALETTES } from './visuals.js';
import * as capture from './capture.js';
import { slots, BONES, status as poseStatus, reset as resetPose } from './pose.js';

const $ = (id) => document.getElementById(id);
let handlers = {}, noteTimer = 0;
const HL = 360, hE = new Float32Array(HL), hS = new Float32Array(HL), hC = new Float32Array(HL), hG = new Float32Array(HL);
let hp = 0;
const CELL = 6, OX = 8, OY = 8;        // géométrie de la grille dans le canvas debug
let sel = -1, drag = null, cfgShown = 0, hintIdx = 0, hintCycle = -1, galleryShown = -1, endShown = null, clearArmed = 0;
const modeKey = () => (settings.mode === 'crowd' ? 'crowd' : settings.zones ? 'trio' : 'group');
const INVITE = {
  trio: ['Imaginons la Créature', 'Elle attend trois d\'entre vous'],
  group: ['Réveillons la Créature', 'Approchez, elle vous écoute'],
  crowd: ['Réveillons la Créature', 'Imaginons-la ensemble'],
};

export function note(text, ms = 5000) {
  const n = $('note');
  n.textContent = text; n.classList.add('on');
  clearTimeout(noteTimer);
  if (ms) noteTimer = setTimeout(() => n.classList.remove('on'), ms);
}

export async function refreshCameras() {
  const cams = await capture.listCameras(), sel = $('camera');
  sel.innerHTML = '';
  if (!cams.length) sel.add(new Option('Aucune caméra détectée', ''));
  cams.forEach((c, i) => sel.add(new Option(c.label || `Caméra ${i + 1}`, c.deviceId)));
  if (settings.cameraId) sel.value = settings.cameraId;
}

function fill(sel, entries, value) {
  entries.forEach(([v, label]) => sel.add(new Option(label, v)));
  sel.value = value;
}

function sync() {
  $('vSens').textContent = settings.sensitivity.toFixed(2);
  $('vVol').textContent = Math.round(settings.volume * 100) + ' %';
  $('vDrama').textContent = '×' + settings.dramaSpeed;
  $('dbgOn').checked = settings.debug; $('debug').classList.toggle('on', settings.debug);
  $('sim').checked = settings.simulate; $('simBox').classList.toggle('on', settings.simulate);
  const group = settings.mode === 'group', mk = modeKey();
  document.body.classList.toggle('group', group);
  document.body.classList.toggle('trio', mk === 'trio');
  $('mode').value = mk;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mk));
  $('invite').firstElementChild.textContent = INVITE[mk][0]; $('invite').lastElementChild.textContent = INVITE[mk][1];
  $('preset').value = settings.preset; $('sessionMin').value = settings.sessionMin; $('hintsOn').checked = settings.hints;
  $('journeyOn').checked = settings.journey; document.body.classList.toggle('journey', settings.journey);
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === settings.preset && !settings.custom));
  $('cfg').textContent = (PRESETS[settings.preset]?.name || '') + (settings.custom ? ' · libre' : '');
  $('creatureOn').checked = settings.creature; $('gauge').style.display = settings.creature ? 'none' : '';
  document.querySelectorAll('[data-g]').forEach((b) => { b.dataset.c ??= b.textContent; b.textContent = group ? b.dataset.g : b.dataset.c; });
  $('showSec').checked = settings.showSectors;
  $('sectors').classList.toggle('on', settings.showSectors && mk !== 'trio');
  $('zones').classList.toggle('on', settings.showSectors && mk === 'trio');
  document.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('active', +b.dataset.p === settings.simPreset));
  document.body.classList.toggle('clean', $('panel').classList.contains('hidden') && !settings.simulate && $('start').classList.contains('hidden'));
  saveSettings();
}

// ---------- Secteurs ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Reconstruit la liste de la régie et le calque projeté. À appeler après tout changement de structure.
function sectorsChanged(rebuildList = true) {
  rebuildSectorMap();
  const S = settings.sectors, isTrio = trio();
  if (sel >= S.length) sel = -1;
  if (rebuildList) {
    $('secList').innerHTML = (isTrio ? S.slice(0, ZONES) : S).map((s, i) => `
      <div class="sec${i === sel ? ' sel' : ''}" data-i="${i}" style="border-left-color:${s.color}">
        <div class="row"><input type="color" data-f="color" value="${s.color}" title="Couleur">
          <input type="text" data-f="name" value="${esc(s.name)}" maxlength="28" title="Nom">
          <button data-f="del" title="Supprimer ce secteur">✕</button></div>
        <div class="row"><select data-f="inst" title="Instrument">${Object.entries(INSTRUMENTS).map(([k, l]) =>
          `<option value="${k}"${k === s.inst ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <input type="range" data-f="vol" min="0" max="1.5" step="0.05" value="${s.vol}" title="Volume">
          <label class="check"><input type="checkbox" data-f="mute"${s.mute ? ' checked' : ''}>Muet</label></div>
      </div>`).join('');
  }
  $('sectors').innerHTML = S.map((s) => `<div style="left:${s.x / GW * 100}%;top:${s.y / GH * 100}%;width:${s.w / GW * 100}%;height:${s.h / GH * 100}%;
    border-color:${s.color};color:${s.color}"><span>${esc(s.name)} · ${INSTRUMENTS[s.inst] || ''}</span></div>`).join('');
  // Scène à trois : un repère discret par place, au nom de son instrument, qui s'allume quand quelqu'un s'y tient.
  $('zones').innerHTML = isTrio ? S.slice(0, ZONES).map((s) => `<div><b>${esc(INSTRUMENTS[s.inst] || '')}</b><i><u></u><u></u><u></u></i></div>`).join('') : '';
  saveSettings();
}

function onSectorInput(e) {
  const row = e.target.closest('.sec'), f = e.target.dataset.f;
  if (!row || !f) return;
  const i = +row.dataset.i, s = settings.sectors[i];
  if (!s) return;
  if (f === 'del') {
    if (e.type !== 'click' || settings.mode === 'group') return;
    settings.sectors.splice(i, 1); sel = -1; sectorsChanged(); return;
  }
  if (e.type === 'click') { if (sel !== i) { sel = i; document.querySelectorAll('.sec').forEach((r, k) => r.classList.toggle('sel', k === i)); } return; }
  if (f === 'mute') s.mute = e.target.checked;
  else if (f === 'vol') s.vol = +e.target.value;
  else if (f === 'name') s.name = e.target.value;
  else { s[f] = e.target.value; if (f === 'color') row.style.borderLeftColor = s.color; }
  if (f === 'inst') { settings.custom = true; sync(); }
  sectorsChanged(false);       // la liste n'est pas reconstruite pendant la saisie
}

// Édition à la souris sur la grille debug.
function cellAt(e) {
  const r = $('debug').getBoundingClientRect();
  return [(e.clientX - r.left - OX) / CELL, (e.clientY - r.top - OY) / CELL];
}
function editorDown(e) {
  if (settings.mode === 'group') return;        // en petit groupe, les rectangles suivent les personnes
  const [gx, gy] = cellAt(e), S = settings.sectors, M = 1.3;
  if (gx < -1 || gy < -1 || gx > GW + 1 || gy > GH + 1) return;
  let hit = -1;
  const inside = (s) => gx >= s.x - M && gx <= s.x + s.w + M && gy >= s.y - M && gy <= s.y + s.h + M;
  if (sel >= 0 && inside(S[sel])) hit = sel;
  else hit = S.findIndex(inside);
  if (hit >= 0) {
    const s = S[hit];
    const L = Math.abs(gx - s.x) < M, R = Math.abs(gx - s.x - s.w) < M, T = Math.abs(gy - s.y) < M, B = Math.abs(gy - s.y - s.h) < M;
    drag = L || R || T || B
      ? { i: hit, size: true, fx: L || R, fy: T || B, ax: L ? s.x + s.w : s.x, ay: T ? s.y + s.h : s.y }
      : { i: hit, dx: gx - s.x, dy: gy - s.y };
    sel = hit;
  } else if (S.length < MAX_SECTORS) {
    const x = clamp(Math.round(gx), 0, GW - 2), y = clamp(Math.round(gy), 0, GH - 2), n = S.length;
    const used = new Set(S.map((s) => s.color));
    S.push({ name: 'Secteur ' + (n + 1), color: SECTOR_COLORS.find((c) => !used.has(c)) || SECTOR_COLORS[n],
      inst: Object.keys(INSTRUMENTS)[n % 8], vol: 1, mute: false, x, y, w: 2, h: 2 });
    drag = { i: n, size: true, fx: true, fy: true, ax: x, ay: y, fresh: true };
    sel = n;
  } else { note(`${MAX_SECTORS} secteurs au plus : supprimez-en un pour en créer un autre.`, 4000); return; }
  $('debug').setPointerCapture(e.pointerId);
  e.preventDefault();
}
function editorMove(e) {
  if (!drag) return;
  const [gx, gy] = cellAt(e), s = settings.sectors[drag.i];
  if (drag.size) {
    if (drag.fx) { const a = clamp(Math.round(Math.min(drag.ax, gx)), 0, GW - 2), b = clamp(Math.round(Math.max(drag.ax, gx)), a + 2, GW); s.x = a; s.w = b - a; }
    if (drag.fy) { const a = clamp(Math.round(Math.min(drag.ay, gy)), 0, GH - 2), b = clamp(Math.round(Math.max(drag.ay, gy)), a + 2, GH); s.y = a; s.h = b - a; }
  } else {
    s.x = clamp(Math.round(gx - drag.dx), 0, GW - s.w); s.y = clamp(Math.round(gy - drag.dy), 0, GH - s.h);
  }
  rebuildSectorMap();
}
function editorUp() {
  if (!drag) return;
  const s = settings.sectors[drag.i];
  if (drag.fresh && (s.w < 3 || s.h < 3)) { settings.sectors.splice(drag.i, 1); sel = -1; }   // simple clic : rien à créer
  drag = null;
  sectorsChanged();
}
function deleteSelected() {
  if (sel < 0 || !settings.sectors[sel] || settings.mode === 'group') return;
  settings.sectors.splice(sel, 1); sel = -1; sectorsChanged();
}

// ---------- Export / import de la configuration ----------
const CFG_KEYS = ['journey', 'sensitivity', 'scale', 'key', 'volume', 'palette', 'dramaSpeed', 'showSectors', 'zones', 'creature', 'preset', 'custom', 'sessionMin', 'hints'];
function exportConfig() {
  const cfg = { type: 'foule-sonore', version: 4, sectors: configOf('crowd'), players: playersConfig() };
  CFG_KEYS.forEach((k) => { cfg[k] = settings[k]; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }));
  a.download = 'foule-sonore-config.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.sectors)) throw new Error('format');
  setConfig('crowd', sanitizeSectors(cfg.sectors));
  if (Array.isArray(cfg.players)) setConfig('group', sanitizePlayers(cfg.players));
  [...configOf('crowd'), ...configOf('group')].forEach((s) => { if (!INSTRUMENTS[s.inst]) s.inst = 'piano'; });
  if (SCALES[cfg.scale]) settings.scale = cfg.scale;
  if (PALETTES[cfg.palette]) settings.palette = cfg.palette;
  if (cfg.key >= 0 && cfg.key < 12) settings.key = cfg.key | 0;
  if (cfg.volume >= 0) settings.volume = clamp(+cfg.volume);
  if (cfg.sensitivity > 0) settings.sensitivity = clamp(+cfg.sensitivity, 0.3, 4);
  if (cfg.dramaSpeed > 0) settings.dramaSpeed = clamp(+cfg.dramaSpeed, 0.25, 6);
  settings.showSectors = !!cfg.showSectors;
  if ('zones' in cfg) settings.zones = !!cfg.zones;
  if ('creature' in cfg) settings.creature = !!cfg.creature;
  if (PRESETS[cfg.preset]) settings.preset = cfg.preset;
  if ('custom' in cfg) settings.custom = !!cfg.custom;
  if (cfg.sessionMin >= 0) settings.sessionMin = clamp(+cfg.sessionMin, 0, 30);
  if ('hints' in cfg) settings.hints = !!cfg.hints;
  if ('journey' in cfg) settings.journey = !!cfg.journey;
  resetPose();
  sel = -1;
  $('scale').value = settings.scale; $('key').value = settings.key; $('palette').value = settings.palette;
  $('sens').value = settings.sensitivity; $('vol').value = settings.volume; $('drama').value = settings.dramaSpeed;
  $('layout').value = '';
  sectorsChanged(); sync();
}
async function importConfig(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { applyConfig(JSON.parse(await file.text())); note('Configuration importée.', 3000); }
  catch { note('Fichier de configuration illisible.', 5000); }
}

// ---------- Configurations d'instruments ----------
// Applique un trio complet à chaud : instruments, gamme, tonalité (le tempo et la grille suivent dans music.js).
export function applyPreset(id) {
  const p = PRESETS[id];
  if (!p) return;
  settings.preset = id; settings.custom = false; settings.scale = p.scale; settings.key = p.key;
  for (const mode of ['group', 'crowd']) p.insts.forEach((k, i) => { const s = configOf(mode)[i]; if (s) s.inst = k; });
  $('scale').value = settings.scale; $('key').value = settings.key;
  cfgShown = performance.now();
  sectorsChanged(); sync();
}
export const presetLine = (id = settings.preset) => { const p = PRESETS[id]; return p ? `${p.name} · ${p.insts.map((k) => INSTRUMENTS[k]).join(', ')}` : ''; };
function openRegie() { window.open('regie.html', 'foule-regie', 'width=540,height=900'); }

// Régie sur téléphone : un code QR à scanner, qui porte l'adresse de la régie et le code secret du canal.
let qrFor = '';
async function showNet() {
  const on = settings.remoteOn, url = on ? regieUrl() : '';
  $('netOn').checked = on; $('netBox').classList.toggle('on', on);
  if (!on || url === qrFor) return;
  qrFor = url;
  try {
    const qrcode = (await import('../vendor/qrcode.mjs')).default, q = qrcode(0, 'M');
    q.addData(url); q.make();
    $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  } catch { $('qr').textContent = url; }
}
async function toggleNet(on, fresh) { await setNet(on, fresh); showNet(); }

// ---------- Régie à distance (autre fenêtre du même navigateur, voir remote.js) ----------
const REMOTE_SET = { volume: [0, 1], sensitivity: [0.3, 4], dramaSpeed: [0.25, 6], sessionMin: [0, 30], key: [0, 11] };
export function remoteHello() {
  return { presets: Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, sub: p.sub, insts: p.insts.map((k) => INSTRUMENTS[k]) })),
    instruments: INSTRUMENTS, scales: Object.fromEntries(Object.entries(SCALES).map(([k, s]) => [k, s.label])), keys: KEYS };
}
export function remoteState() {
  const d = state.drama, ss = state.session, n = trio() ? ZONES : settings.sectors.length;
  return {
    preset: settings.preset, custom: settings.custom, mode: settings.mode === 'crowd' ? 'crowd' : settings.zones ? 'trio' : 'group', running: state.music.running,
    places: settings.sectors.slice(0, n).map((s, i) => ({ name: s.name, inst: s.inst, vol: s.vol, mute: s.mute, present: s.present !== false, on: state.sec[i].on, energy: +state.sec[i].energy.toFixed(2) })),
    gauge: +d.gauge.toFixed(3), phase: d.phase, attract: d.attract, hush: d.hush, lift: +d.lift.toFixed(2), bpm: Math.round(state.music.bpm),
    session: { on: ss.on, t: Math.floor(ss.t), ended: ss.ended > 0 },
    stops: state.journey.bands.map((b) => PRESETS[b.id]?.name).filter(Boolean), creatures: gallery.n, overflows: state.journey.overflows,
    set: { journey: settings.journey, volume: settings.volume, sensitivity: settings.sensitivity, dramaSpeed: settings.dramaSpeed, sessionMin: settings.sessionMin, scale: settings.scale, key: settings.key, hints: settings.hints, simulate: settings.simulate },
  };
}
export function remoteApply(m) {
  const s = settings.sectors[m.i];
  if (m.type === 'preset') applyPreset(m.preset);
  else if (m.type === 'inst' && s && INSTRUMENTS[m.inst]) { s.inst = m.inst; settings.custom = true; sectorsChanged(); sync(); }
  else if (m.type === 'vol' && s) { s.vol = clamp(+m.v, 0, 1.5); sectorsChanged(); }
  else if (m.type === 'mute' && s) { s.mute = !!m.v; sectorsChanged(); }
  else if (m.type === 'set' && REMOTE_SET[m.key]) { const [a, b] = REMOTE_SET[m.key]; settings[m.key] = m.key === 'key' ? Math.round(clamp(+m.value, a, b)) : clamp(+m.value, a, b); syncInputs(); sync(); }
  else if (m.type === 'set' && m.key === 'scale' && SCALES[m.value]) { settings.scale = m.value; syncInputs(); sync(); }
  else if (m.type === 'set' && m.key === 'hints') { settings.hints = !!m.value; sync(); }
  else if (m.type === 'set' && m.key === 'journey') { settings.journey = !!m.value; sync(); }
  else if (m.type === 'cmd' && m.name === 'next') nextStop();
  else if (m.type === 'cmd' && m.name === 'overflow') overflow();
  else if (m.type === 'cmd' && m.name === 'end') endSession();
  else if (m.type === 'cmd' && m.name === 'new') newSession();
}
function syncInputs() {
  $('scale').value = settings.scale; $('key').value = settings.key;
  $('sens').value = settings.sensitivity; $('vol').value = settings.volume; $('drama').value = settings.dramaSpeed;
}

export function changeMode(mode) {
  if (!INVITE[mode]) return;
  if (mode !== 'crowd') settings.zones = mode === 'trio';
  setMode(mode === 'crowd' ? 'crowd' : 'group'); sel = -1; drag = null;
  resetPose();
  sectorsChanged(); sync();
  handlers.onMode?.(settings.mode);
}
export function setSim(v) { settings.simulate = v; handlers.onSim?.(v); sync(); }
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function togglePanel() { $('panel').classList.toggle('hidden'); sync(); }

export function init(h) {
  handlers = h;
  fill($('scale'), Object.entries(SCALES).map(([k, s]) => [k, s.label]), settings.scale);
  fill($('key'), KEYS.map((k, i) => [i, k]), settings.key);
  fill($('palette'), Object.entries(PALETTES).map(([k, p]) => [k, p.label]), settings.palette);
  fill($('preset'), Object.entries(PRESETS).map(([k, p]) => [k, `${p.name} · ${p.insts.map((i) => INSTRUMENTS[i]).join(', ')}`]), settings.preset);
  $('presetPick').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}"><b>${esc(p.name)}</b><i>${esc(p.sub)}</i><span>${p.insts.map((i) => esc(INSTRUMENTS[i]).replace(/ \(.*\)/, '')).join('<br>')}</span></button>`).join('');
  document.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => applyPreset(b.dataset.preset); });
  $('preset').onchange = (e) => applyPreset(e.target.value);
  $('sessionMin').onchange = (e) => { settings.sessionMin = +e.target.value; sync(); };
  $('hintsOn').onchange = (e) => { settings.hints = e.target.checked; sync(); };
  $('sessNew').onclick = newSession; $('sessEnd').onclick = endSession; $('openRegie').onclick = openRegie;
  $('journeyOn').onchange = (e) => { settings.journey = e.target.checked; sync(); };
  $('nextStop').onclick = nextStop; $('overflowBtn').onclick = overflow;
  $('galExport').onclick = async () => { if (!(await exportGallery())) note('La galerie est encore vide.', 3000); };
  $('galClear').onclick = (e) => {            // deux clics pour vider : pas de fenêtre de confirmation
    if (performance.now() - clearArmed < 3000) { clearGallery(); e.target.textContent = 'Vider la galerie'; clearArmed = 0; note('Galerie vidée.', 2500); }
    else { clearArmed = performance.now(); e.target.textContent = 'Confirmer ?'; setTimeout(() => { e.target.textContent = 'Vider la galerie'; }, 3000); }
  };
  $('netOn').onchange = (e) => toggleNet(e.target.checked);
  $('netNew').onclick = () => toggleNet(true, true);
  $('netCopy').onclick = () => { navigator.clipboard?.writeText(regieUrl()).then(() => note('Lien de la régie copié.', 2500), () => note(regieUrl(), 9000)); };
  showNet();
  fill($('layout'), [['', 'Personnalisé'], ...Object.entries(LAYOUTS).map(([k, l]) => [k, l.label])], '');
  $('sens').value = settings.sensitivity; $('vol').value = settings.volume; $('drama').value = settings.dramaSpeed;

  $('sens').oninput = (e) => { settings.sensitivity = +e.target.value; sync(); };
  $('vol').oninput = (e) => { settings.volume = +e.target.value; sync(); };
  $('drama').oninput = (e) => { settings.dramaSpeed = +e.target.value; sync(); };
  $('scale').onchange = (e) => { settings.scale = e.target.value; sync(); };
  $('key').onchange = (e) => { settings.key = +e.target.value; sync(); };
  $('palette').onchange = (e) => { settings.palette = e.target.value; sync(); };
  $('mode').onchange = (e) => changeMode(e.target.value);
  document.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => changeMode(b.dataset.mode); });
  $('camera').onchange = (e) => { settings.cameraId = e.target.value; sync(); h.onCamera?.(); };
  $('dbgOn').onchange = (e) => { settings.debug = e.target.checked; sync(); };
  $('sim').onchange = (e) => setSim(e.target.checked);
  $('showSec').onchange = (e) => { settings.showSectors = e.target.checked; sync(); };
  $('creatureOn').onchange = (e) => { settings.creature = e.target.checked; sync(); };
  $('layout').onchange = (e) => { if (e.target.value) { settings.sectors = makeLayout(e.target.value, settings.sectors); sel = -1; sectorsChanged(); } };
  $('secList').addEventListener('input', onSectorInput);
  $('secList').addEventListener('click', onSectorInput);
  $('exportCfg').onclick = exportConfig;
  $('importCfg').onclick = () => $('importFile').click();
  $('importFile').onchange = importConfig;
  $('recal').onclick = () => { capture.recalibrate(); };
  $('full').onclick = fullscreen;
  $('jump').onclick = () => capture.simJump();
  document.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { settings.simPreset = +b.dataset.p; sync(); }; });
  $('btnStart').onclick = () => h.onStart(true);
  $('btnSim').onclick = () => h.onStart(false);

  const dbg = $('debug');
  dbg.addEventListener('pointerdown', editorDown);
  dbg.addEventListener('pointermove', editorMove);
  dbg.addEventListener('pointerup', editorUp);
  dbg.addEventListener('pointercancel', editorUp);

  window.addEventListener('keydown', (e) => {
    const tg = e.target;
    if (tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && tg.type === 'text') || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'h') togglePanel();
    else if (k === 'd') { settings.debug = !settings.debug; sync(); }
    else if (k === 'f') fullscreen();
    else if (k === 's') setSim(!settings.simulate);
    else if (k === 'r') capture.recalibrate();
    else if (k >= '0' && k <= '7') { settings.simPreset = +k; sync(); }
    else if (k === 'g') openRegie();
    else if (k === ' ') { e.preventDefault(); capture.simJump(); }
    else if ((k === 'delete' || k === 'backspace') && settings.debug) deleteSelected();
  });
  sectorsChanged();
  sync();
}

export function started() { $('start').classList.add('hidden'); $('panel').classList.remove('hidden'); sync(); }

function drawDebug() {
  const c = $('debug'), g = c.getContext('2d'), F = state.flow, m = state.m, d = state.drama, mu = state.music;
  const S = CELL, W = GW * S, ox = OX, oy = OY, secs = settings.sectors;
  g.clearRect(0, 0, c.width, c.height);
  // Grille de flux : un trait par cellule active (jamais l'image de la caméra).
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(ox, oy, W, GH * S);
  g.lineWidth = 1;
  for (let i = 0; i < GN; i++) {
    const a = F.act[i];
    if (a < 0.03) continue;
    const x = ox + ((i % GW) + 0.5) * S, y = oy + (((i / GW) | 0) + 0.5) * S;
    g.strokeStyle = `rgba(255,${150 + 100 * a | 0},60,${0.3 + 0.7 * a})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + F.x[i] * 0.7, y + F.y[i] * 0.7); g.stroke();
  }
  // Secteurs : contour, nom, instrument ; le secteur sélectionné est en trait épais.
  g.font = '11px ui-monospace, Menlo, monospace';
  secs.forEach((s, i) => {
    if (s.present === false) return;
    const q = state.sec[i], x = ox + s.x * S, y = oy + s.y * S, w = s.w * S, h = s.h * S;
    g.globalAlpha = 0.06 + 0.2 * q.pulse; g.fillStyle = s.color; g.fillRect(x, y, w, h);
    g.globalAlpha = q.on ? 1 : 0.55; g.strokeStyle = s.color; g.lineWidth = i === sel ? 2.5 : 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillText(`${s.name} · ${INSTRUMENTS[s.inst] || ''}`.slice(0, Math.max(3, (w / 6.7) | 0)), x + 4, y + 13);
    g.globalAlpha = 1;
  });
  if (settings.mode === 'group') {          // silhouettes suivies (traits seulement, jamais l'image)
    g.lineWidth = 2;
    slots.forEach((p, i) => {
      if (!p.on || !secs[i]) return;
      g.strokeStyle = secs[i].color; g.beginPath();
      for (const [a, b] of BONES) {
        if (p.vis[a] < 0.3 || p.vis[b] < 0.3) continue;
        g.moveTo(ox + p.px[a] * W, oy + p.py[a] * GH * S); g.lineTo(ox + p.px[b] * W, oy + p.py[b] * GH * S);
      }
      g.stroke();
      g.beginPath(); g.arc(ox + p.px[0] * W, oy + p.py[0] * GH * S, 5, 0, 6.283); g.stroke();
    });
  }
  g.lineWidth = 1;
  g.strokeStyle = '#fff'; g.beginPath(); g.arc(ox + m.cx * W, oy + m.cy * GH * S, 5, 0, 6.283); g.stroke();
  // Énergie par secteur.
  const zy = oy + GH * S + 4, n = Math.max(1, secs.length);
  secs.forEach((s, i) => {
    g.globalAlpha = 0.15 + 0.85 * state.sec[i].energy; g.fillStyle = s.color;
    g.fillRect(ox + i * W / n + 1, zy, W / n - 2, 6);
  });
  g.globalAlpha = 1;
  // Courbes.
  const cy0 = zy + 14, ch = 70;
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(ox, cy0, W, ch);
  const curve = (h, col) => {
    g.strokeStyle = col; g.beginPath();
    for (let i = 0; i < HL; i++) {
      const v = h[(hp + i) % HL], x = ox + i / (HL - 1) * W, y = cy0 + ch - v * ch;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  };
  curve(hE, '#ff6a3d'); curve(hS, '#5ad1ff'); curve(hC, '#8dff7a'); curve(hG, '#ffffff');
  g.font = '12px ui-monospace, Menlo, monospace';
  const ty = cy0 + ch + 16, pc = (v) => String(Math.round(v * 100)).padStart(3);
  const line = (i, col, txt) => { g.fillStyle = col; g.fillText(txt, ox, ty + i * 15); };
  line(0, '#ff6a3d', `énergie ${pc(m.energy)}`); g.fillStyle = '#5ad1ff'; g.fillText(`vitesse ${pc(m.speed)}`, ox + 95, ty);
  g.fillStyle = '#8dff7a'; g.fillText(`cohérence ${pc(m.coherence)}`, ox + 190, ty);
  g.fillStyle = '#fff'; g.fillText(`jauge ${pc(d.gauge)}`, ox + 300, ty);
  line(1, '#ddd', `tempo ${mu.bpm.toFixed(0)} BPM   pulsation foule ${m.pulseConf > 0.5 ? m.pulseBpm.toFixed(0) + ' BPM' : '—'} (${pc(m.pulseConf)})`);
  line(2, '#ddd', `palier ${d.tier} · ${d.phase}${d.attract ? ' · attraction' : ''}   ${settings.mode === 'group' ? `personnes ${slots.filter((p) => p.on).length} · suivi ${settings.simulate ? 'simulé' : poseStatus.ready ? 'actif' : poseStatus.loading ? 'chargement' : 'absent'}` : 'secteurs'} ${secs.map((_, i) => +state.sec[i].on).join('')}`);
  line(3, '#999', `${state.perf.fps.toFixed(0)} i/s · qualité ${state.perf.quality} · ${settings.simulate ? 'simulation' : state.capture.mode}   niveau ${mu.level.toFixed(3)}`);
}

// Consignes au public : une ligne discrète qui change toutes les 11 s, choisie selon ce qui se passe sur scène.
function hintList() {
  const ss = state.session, group = settings.mode === 'group', L = [];
  const n = group ? settings.sectors.filter((s) => s.present).length : 0;
  // Des invitations plutôt qu'un mode d'emploi : chacune appelle un geste sans le décrire.
  if (settings.sessionMin && ss.on && settings.sessionMin * 60 - ss.t < 35) return [settings.journey ? 'Retour à Genève : ramenez tout ce que vous avez trouvé' : 'C\'est maintenant : tout, ensemble'];
  if (!group) return ['Elle vous écoute', 'Et si vous ne faisiez plus qu\'un ?', 'Faites trembler l\'air'];
  if (ss.t < 40) L.push('Elle vous écoute', 'Allez chercher la note la plus haute', 'Faites-vous immense');
  else L.push('Faites trembler l\'air', 'Devenez tout petit', 'Ralentissez, jusqu\'à presque rien', 'Touchez le ciel', 'Un bond, pour voir');
  if (trio()) L.push('Et si vous changiez de place ?', 'Prenez la place de l\'autre');
  if (n >= 2) L.push('Portez le ciel à plusieurs', 'Retenez votre souffle, tous ensemble', 'Répondez-vous', 'Laissez passer le plus discret');
  if (trio() && n > 0 && n < ZONES) L.push('Il manque quelqu\'un pour l\'éveiller');
  return L;
}
function updateHints(now) {
  const d = state.drama, ss = state.session, el = $('hint');
  let txt = '', on = false;
  if (ss.ended > 0 || !state.music.running) { /* rien */ }
  else if (now - cfgShown < 6000 && cfgShown) { txt = presetLine(); on = true; }
  else if (d.lift > 0.2) { txt = 'Encore…'; on = true; }
  else if (settings.hints && !d.attract && !d.hush) {
    const cyc = Math.floor(now / 11000);
    if (cyc !== hintCycle) { hintCycle = cyc; hintIdx++; }
    const L = hintList();
    txt = L[hintIdx % L.length]; on = now % 11000 < 7000;
  }
  if (on && el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('on', on);
  $('end').classList.toggle('on', ss.ended > 0);
  // Fin de session : la créature du trio reçoit son numéro. À l'attente : toutes celles de la soirée.
  const last = state.journey.last;
  if (ss.ended > 0 && last && endShown !== last) {
    endShown = last;
    $('end').innerHTML = `<b>Créature n° ${last.n}, ${esc(last.nick)}</b><small>née à ${last.at} ${esc(last.who)}</small><p>${esc(last.text)}</p>`;
  }
  if (galleryShown !== gallery.version) {
    galleryShown = gallery.version;
    const items = gallery.items.slice(-24);
    $('gallery').innerHTML = items.map((it) => `<figure><img src="${it.img}" alt=""><figcaption>${esc(it.nick || 'n° ' + it.n)}</figcaption></figure>`).join('');
    $('galCount').textContent = gallery.items.length ? `${gallery.items.length} créature${gallery.items.length > 1 ? 's' : ''} ce soir` : 'Galerie vide';
  }
  const wall = state.music.running && d.attract && ss.ended === 0 && gallery.items.length > 0;
  $('gallery').classList.toggle('on', wall); document.body.classList.toggle('wall', wall);
  const dur = settings.sessionMin * 60;
  $('clock').style.width = (ss.on && dur && ss.ended === 0 ? clamp(ss.t / dur) * 100 : 0) + '%';
  $('cfg').classList.toggle('on', state.music.running && !d.attract);
  if (settings.remoteOn && !$('panel').classList.contains('hidden')) {
    const n = netInfo();
    $('netInfo').textContent = !n.ready || !n.up ? 'Connexion au relais… (Internet requis)' : `Relais ${n.up}/${n.total} · ${n.phone ? 'téléphone relié' : 'en attente du téléphone'}`;
  }
}

export function update() {
  const d = state.drama, m = state.m, c = state.capture;
  updateHints(performance.now());
  hE[hp] = m.energy; hS[hp] = m.speed; hC[hp] = m.coherence; hG[hp] = d.gauge; hp = (hp + 1) % HL;
  $('gaugeFill').style.width = (d.gauge * 100).toFixed(1) + '%';
  $('gauge').classList.toggle('climax', d.phase === 'climax');
  $('gauge').style.opacity = d.attract ? 0.25 : 1;
  $('invite').classList.toggle('on', d.attract && state.music.running);
  if (c.calibLeft > 0) note(`Calibration… ${Math.ceil(c.calibLeft)} s`, 800);
  if (settings.showSectors && trio()) {
    const el = $('zones').children;
    for (let i = 0; i < el.length; i++) {
      const q = state.sec[i], s = settings.sectors[i];
      el[i].style.opacity = (s.present ? (q.on ? 0.75 : 0.5) : 0.22) + 0.25 * q.pulse;
      // Trois petits traits : les places que la personne qui se tient ici a déjà tenues.
      const seen = s.present ? state.who.visited.get(slots[i].pid) : null, marks = el[i].lastElementChild.children;
      for (let k = 0; k < marks.length; k++) marks[k].className = seen?.has(k) ? 'on' : '';
    }
  } else if (settings.showSectors) {            // le contour d'un secteur s'allume quand son instrument joue
    const el = $('sectors').children;
    for (let i = 0; i < el.length; i++) {
      const q = state.sec[i], s = settings.sectors[i];
      el[i].style.opacity = (q.on ? 0.45 : 0.2) + 0.5 * q.pulse;
      if (settings.mode === 'group' && s) {          // le cadre suit la personne
        el[i].style.display = s.present ? '' : 'none';
        el[i].style.left = s.x / GW * 100 + '%'; el[i].style.top = s.y / GH * 100 + '%';
        el[i].style.width = s.w / GW * 100 + '%'; el[i].style.height = s.h / GH * 100 + '%';
      }
    }
  }
  if (settings.debug) drawDebug();
}
