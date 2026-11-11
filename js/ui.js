// Régie : panneau de réglages, éditeur de secteurs, raccourcis clavier, jauge, affichage debug.
import { GW, GH, GN, MAX_SECTORS, SECTOR_COLORS, LAYOUTS, makeLayout, sanitizeSectors, rebuildSectorMap,
  state, settings, saveSettings, clamp, setMode, configOf, setConfig, sanitizePlayers, playersConfig } from './state.js';
import { SCALES, KEYS, INSTRUMENTS } from './music.js';
import { PALETTES } from './visuals.js';
import * as capture from './capture.js';
import { slots, BONES, status as poseStatus } from './pose.js';

const $ = (id) => document.getElementById(id);
let handlers = {}, noteTimer = 0;
const HL = 360, hE = new Float32Array(HL), hS = new Float32Array(HL), hC = new Float32Array(HL), hG = new Float32Array(HL);
let hp = 0;
const CELL = 6, OX = 8, OY = 8;        // géométrie de la grille dans le canvas debug
let sel = -1, drag = null;

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
  const group = settings.mode === 'group';
  document.body.classList.toggle('group', group);
  $('mode').value = settings.mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === settings.mode));
  document.querySelectorAll('[data-g]').forEach((b) => { b.dataset.c ??= b.textContent; b.textContent = group ? b.dataset.g : b.dataset.c; });
  $('showSec').checked = settings.showSectors; $('sectors').classList.toggle('on', settings.showSectors);
  document.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('active', +b.dataset.p === settings.simPreset));
  document.body.classList.toggle('clean', $('panel').classList.contains('hidden') && !settings.simulate && $('start').classList.contains('hidden'));
  saveSettings();
}

// ---------- Secteurs ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Reconstruit la liste de la régie et le calque projeté. À appeler après tout changement de structure.
function sectorsChanged(rebuildList = true) {
  rebuildSectorMap();
  const S = settings.sectors;
  if (sel >= S.length) sel = -1;
  if (rebuildList) {
    $('secList').innerHTML = S.map((s, i) => `
      <div class="sec${i === sel ? ' sel' : ''}" data-i="${i}" style="border-left-color:${s.color}">
        <div class="row"><input type="color" data-f="color" value="${s.color}" title="Couleur">
          <input type="text" data-f="name" value="${esc(s.name)}" maxlength="24" title="Nom">
          <button data-f="del" title="Supprimer ce secteur">✕</button></div>
        <div class="row"><select data-f="inst" title="Instrument">${Object.entries(INSTRUMENTS).map(([k, l]) =>
          `<option value="${k}"${k === s.inst ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <input type="range" data-f="vol" min="0" max="1.5" step="0.05" value="${s.vol}" title="Volume">
          <label class="check"><input type="checkbox" data-f="mute"${s.mute ? ' checked' : ''}>Muet</label></div>
      </div>`).join('');
  }
  $('sectors').innerHTML = S.map((s) => `<div style="left:${s.x / GW * 100}%;top:${s.y / GH * 100}%;width:${s.w / GW * 100}%;height:${s.h / GH * 100}%;
    border-color:${s.color};color:${s.color}"><span>${esc(s.name)} · ${INSTRUMENTS[s.inst] || ''}</span></div>`).join('');
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
const CFG_KEYS = ['sensitivity', 'scale', 'key', 'volume', 'palette', 'dramaSpeed', 'showSectors'];
function exportConfig() {
  const cfg = { type: 'foule-sonore', version: 3, sectors: configOf('crowd'), players: playersConfig() };
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

export function changeMode(mode) {
  if (mode !== 'group' && mode !== 'crowd') return;
  setMode(mode); sel = -1; drag = null;
  sectorsChanged(); sync();
  handlers.onMode?.(mode);
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
    else if (k >= '0' && k <= '5') { settings.simPreset = +k; sync(); }
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

export function update() {
  const d = state.drama, m = state.m, c = state.capture;
  hE[hp] = m.energy; hS[hp] = m.speed; hC[hp] = m.coherence; hG[hp] = d.gauge; hp = (hp + 1) % HL;
  $('gaugeFill').style.width = (d.gauge * 100).toFixed(1) + '%';
  $('gauge').classList.toggle('climax', d.phase === 'climax');
  $('gauge').style.opacity = d.attract ? 0.25 : 1;
  $('invite').classList.toggle('on', d.attract && state.music.running);
  if (c.calibLeft > 0) note(`Calibration… ${Math.ceil(c.calibLeft)} s`, 800);
  if (settings.showSectors) {            // le contour d'un secteur s'allume quand son instrument joue
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
