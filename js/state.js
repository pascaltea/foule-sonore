// État partagé : captation -> métriques -> dramaturgie -> musique -> visuels.
export const GW = 64, GH = 36, GN = GW * GH;
export const MAX_SECTORS = 6;
export const SECTOR_COLORS = ['#ff5a36', '#ffc233', '#4cc9ff', '#8dff7a', '#d07bff', '#ff7ab8'];
const DEF_INST = ['drums', 'piano', 'violin', 'bass', 'marimba', 'bells'];

// Découpages prédéfinis : rectangles en fractions de l'image [x, y, largeur, hauteur].
export const LAYOUTS = {
  cols3: { label: '3 colonnes', names: ['Gauche', 'Centre', 'Droite'], r: [0, 1, 2].map((i) => [i / 3, 0, 1 / 3, 1]) },
  halves: { label: '2 moitiés', names: ['Gauche', 'Droite'], r: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  quads: { label: '4 quadrants', names: ['Haut gauche', 'Haut droite', 'Bas gauche', 'Bas droite'],
    r: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  cols5: { label: '5 colonnes', names: [1, 2, 3, 4, 5].map((i) => 'Colonne ' + i), r: [0, 1, 2, 3, 4].map((i) => [i / 5, 0, 1 / 5, 1]) },
};

// Nouveau découpage ; les instruments et volumes déjà choisis sont conservés par rang.
export function makeLayout(name, keep = []) {
  const L = LAYOUTS[name] || LAYOUTS.cols3;
  return L.r.map(([fx, fy, fw, fh], i) => {
    const x = Math.round(fx * GW), y = Math.round(fy * GH);
    return {
      name: L.names[i], color: SECTOR_COLORS[i], inst: keep[i]?.inst || DEF_INST[i],
      vol: keep[i]?.vol ?? 1, mute: false,
      x, y, w: Math.round((fx + fw) * GW) - x, h: Math.round((fy + fh) * GH) - y,
    };
  });
}

export function sanitizeSectors(arr) {
  if (!Array.isArray(arr) || !arr.length) return makeLayout('cols3');
  return arr.slice(0, MAX_SECTORS).map((s, i) => {
    const x = clamp(Math.round(+s.x || 0), 0, GW - 2), y = clamp(Math.round(+s.y || 0), 0, GH - 2);
    return {
      name: String(s.name ?? 'Secteur ' + (i + 1)).slice(0, 24),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : SECTOR_COLORS[i],
      inst: String(s.inst || DEF_INST[i]), vol: clamp(+s.vol >= 0 ? +s.vol : 1, 0, 1.5), mute: !!s.mute,
      x, y, w: clamp(Math.round(+s.w || 2), 2, GW - x), h: clamp(Math.round(+s.h || 2), 2, GH - y),
    };
  });
}

const KEY = 'foule-sonore';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* stockage indisponible */ }

// Mode « petit groupe » : une personne suivie = un instrument. Le rectangle suit la personne à chaque image.
export const MAX_PLAYERS = 5;
export function sanitizePlayers(arr) {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const s = (Array.isArray(arr) && arr[i]) || {};
    return {
      name: String(s.name ?? 'Personne ' + (i + 1)).slice(0, 24),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : SECTOR_COLORS[i],
      inst: String(s.inst || ['piano', 'drums', 'violin', 'marimba', 'bass'][i]), vol: clamp(+s.vol >= 0 ? +s.vol : 1, 0, 1.5), mute: !!s.mute,
      x: 0, y: 0, w: 0, h: 0, present: false,
    };
  });
}

export const settings = Object.assign({
  mode: 'crowd',      // 'crowd' (foule, secteurs fixes) ou 'group' (1 à 5 personnes suivies)
  cameraId: '',
  sensitivity: 1.3,   // foule large et lointaine : gain un peu relevé par défaut
  scale: 'pentaMin',
  key: 9,             // La
  volume: 0.8,
  palette: 'braise',
  debug: false,
  dramaSpeed: 1,
  showSectors: false,
}, saved, { simulate: false, simPreset: 2, simSector: -1 });
if (settings.mode !== 'group') settings.mode = 'crowd';
// settings.sectors désigne toujours la configuration du mode actif ; celle de l'autre mode attend dans « stash ».
let stash = settings.mode === 'group' ? sanitizeSectors(saved.sectors) : sanitizePlayers(saved.players);
settings.sectors = settings.mode === 'group' ? sanitizePlayers(saved.players) : sanitizeSectors(saved.sectors);
delete settings.players;

export const configOf = (mode) => (mode === settings.mode ? settings.sectors : stash);
export function setConfig(mode, arr) { if (mode === settings.mode) settings.sectors = arr; else stash = arr; }
export function setMode(mode) {
  if (mode === settings.mode) return;
  const cur = settings.sectors;
  settings.sectors = stash; stash = cur; settings.mode = mode;
  state.sec.forEach((q) => Object.assign(q, newSec(), { peakCount: q.peakCount }));
  rebuildSectorMap();
}
export const playersConfig = () => configOf('group').map(({ name, color, inst, vol, mute }) => ({ name, color, inst, vol, mute }));

export function saveSettings() {
  const { simulate, simPreset, simSector, sectors, ...keep } = settings;
  keep.sectors = configOf('crowd'); keep.players = playersConfig();
  try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch { /* ignoré */ }
}

const newSec = () => ({ energy: 0, speed: 0, coherence: 0, cy: 0.5, peakCount: 0, peakAge: 99, eFast: 0, eSlow: 0, pulse: 0, on: false });

export const state = {
  // Champ de mouvement, en cellules de grille par seconde, + activité 0..1 par cellule.
  flow: { x: new Float32Array(GN), y: new Float32Array(GN), act: new Float32Array(GN) },
  cellSector: new Int8Array(GN),          // secteur de chaque cellule, -1 si aucun
  secArea: new Float32Array(MAX_SECTORS),
  sec: Array.from({ length: MAX_SECTORS }, newSec),
  capture: { mode: 'off', calibLeft: 0, error: '' },
  m: {
    energy: 0, energyRaw: 0, speed: 0, dirX: 0, dirY: 0, coherence: 0,
    cx: 0.5, cy: 0.5, dispersion: 0,
    pulseBpm: 0, pulseConf: 0, peakCount: 0, peakAge: 99, stillTime: 0, still: false,
  },
  drama: { gauge: 0, tier: 0, phase: 'build', phaseT: 0, attract: true, tierUps: 0 },
  music: {
    running: false, bpm: 90, beatPulse: 0, beatCount: 0, accent: 0, accentCount: 0, accentX: 0.5, accentY: 0.5,
    chord: 0, level: 0,
  },
  perf: { fps: 60, quality: 2 },
};

// À appeler après toute modification des secteurs. En cas de recouvrement, le premier de la liste l'emporte.
export function rebuildSectorMap() {
  const map = state.cellSector, S = settings.sectors;
  map.fill(-1); state.secArea.fill(0);
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i];
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) map[y * GW + x] = i;
  }
  for (let c = 0; c < GN; c++) if (map[c] >= 0) state.secArea[map[c]]++;
}

export function clamp(v, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
// Lissage exponentiel avec temps de montée et de descente distincts.
export function smooth(cur, target, dt, tauUp, tauDown = tauUp) {
  const tau = target > cur ? tauUp : tauDown;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}
rebuildSectorMap();
