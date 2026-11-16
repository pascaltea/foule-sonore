// État partagé : captation -> métriques -> dramaturgie -> musique -> visuels.
export const GW = 64, GH = 36, GN = GW * GH;
export const MAX_SECTORS = 6;
// Couleurs de l'Assemblée créative de Genève : les trois titres des affiches, puis leurs trois décors.
export const SECTOR_COLORS = ['#ffff54', '#ff67ff', '#0ae600', '#0a86c8', '#ff7a0a', '#0a7048'];
export const ZONES = 3;           // scène à trois : gauche, centre, droite
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
      name: String(s.name ?? 'Secteur ' + (i + 1)).slice(0, 28),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : SECTOR_COLORS[i],
      inst: String(s.inst || DEF_INST[i]), vol: clamp(+s.vol >= 0 ? +s.vol : 1, 0, 1.5), mute: !!s.mute,
      x, y, w: clamp(Math.round(+s.w || 2), 2, GW - x), h: clamp(Math.round(+s.h || 2), 2, GH - y),
    };
  });
}

const KEY = 'foule-sonore-acg6';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* stockage indisponible */ }

// Mode « petit groupe » : une personne suivie = un instrument. Le rectangle suit la personne à chaque image.
// En scène à trois, les trois premiers emplacements sont les places gauche, centre et droite : une place, un instrument.
export const MAX_PLAYERS = 5;
const DEF_PLAYERS = [['Gauche', 'drums'], ['Centre', 'piano'], ['Droite', 'violin'], ['Personne 4', 'marimba'], ['Personne 5', 'bass']];
export function sanitizePlayers(arr) {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const s = (Array.isArray(arr) && arr[i]) || {};
    return {
      name: String(s.name ?? DEF_PLAYERS[i][0]).slice(0, 28),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : SECTOR_COLORS[i],
      inst: String(s.inst || DEF_PLAYERS[i][1]), vol: clamp(+s.vol >= 0 ? +s.vol : 1, 0, 1.5), mute: !!s.mute,
      x: 0, y: 0, w: 0, h: 0, present: false,
    };
  });
}

export const settings = Object.assign({
  mode: 'group',      // 'crowd' (foule, secteurs fixes) ou 'group' (personnes suivies)
  zones: true,        // en 'group' : scène à trois, l'instrument dépend de la place (gauche, centre, droite)
  creature: true,     // le dôme incarne la jauge collective
  preset: 'geneve',   // configuration d'instruments (voir PRESETS dans music.js)
  custom: false,      // un instrument a été changé à la main depuis le choix de la configuration
  sessionMin: 5,      // durée d'une session en minutes ; 0 = libre
  hints: false,       // consignes de jeu affichées au public (masquées par défaut, à activer dans les réglages ou la régie)
  rev: 7,
  play: 'gestes',     // 'gestes' : chaque geste joue un son (un instrument) ; 'flux' : l'ancienne partition guidée par le mouvement
  snap: false,        // jeu par gestes : cale chaque son sur une pulsation commune (secours si trois débutants se dispersent)
  gestes: ['frapper', 'ouvrir', 'refermer', 'balayer', 'lever', 'sauter'],
  journey: true,      // voyage aller-retour depuis Genève : les gestes collectifs font changer d'escale
  remoteOn: false,    // régie sur téléphone, par Internet
  room: '',           // code secret du canal de régie
  onlineGallery: true, // les créatures sont publiées dans la galerie en ligne (galerie.html)
  galleryCode: '',    // code de la galerie de cette scène
  cameraId: '',
  sensitivity: 1.3,   // foule large et lointaine : gain un peu relevé par défaut
  scale: 'pentaMin',
  key: 9,             // La
  volume: 0.8,
  palette: 'assemblee',
  debug: false,
  dramaSpeed: 2,
  showSectors: true,
}, saved, { simulate: false, simPreset: 3, simSector: -1 }, saved.rev === 7 ? {} : { hints: false, rev: 7 });   // rev 7 : consignes masquées par défaut, une fois pour toutes
if (settings.mode !== 'crowd') settings.mode = 'group';
export const trio = () => settings.mode === 'group' && settings.zones;
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

const newSec = () => ({ open: 0.5, up: false, energy: 0, speed: 0, coherence: 0, cy: 0.5, peakCount: 0, peakAge: 99, eFast: 0, eSlow: 0, pulse: 0, on: false });

export const state = {
  // Champ de mouvement, en cellules de grille par seconde, + activité 0..1 par cellule.
  flow: { x: new Float32Array(GN), y: new Float32Array(GN), act: new Float32Array(GN) },
  cellSector: new Int8Array(GN),          // secteur de chaque cellule, -1 si aucun
  secArea: new Float32Array(MAX_SECTORS),
  sec: Array.from({ length: MAX_SECTORS }, newSec),
  capture: { mode: 'off', calibLeft: 0, error: '' },
  m: {
    energy: 0, energyRaw: 0, speed: 0, dirX: 0, dirY: 0, coherence: 0, playing: 0,
    cx: 0.5, cy: 0.5, dispersion: 0,
    pulseBpm: 0, pulseConf: 0, peakCount: 0, peakAge: 99, stillTime: 0, still: false,
  },
  drama: { gauge: 0, tier: 0, phase: 'build', phaseT: 0, attract: true, tierUps: 0, act: 0,
    lift: 0, liftStarts: 0, liftCd: 0, drops: 0, hush: false, hushT: 0, hushEnds: 0, loudAge: 99, quietT: 0 },
  session: { on: false, t: 0, ended: 0, ends: 0, idle: 0 },
  ink: [0.03, 0.6, 0.36],
  // Qui est où : chaque personne suivie garde un numéro tant qu'elle reste sur scène, même en changeant de place.
  who: { seq: 0, visited: new Map(), swaps: 0, jumps: 0 },
  flood: 0,           // Genève déborde : 1 au moment du geste, puis retombe
  // Voyage : les pays de la session en cours, chacun devenu une strate du dôme (le plus récent en dernier),
  // et ce que la session dit du trio (traits, forme de la créature, portrait).
  journey: { bands: [], cur: '', t: 0, route: [], idx: 0, maxN: 0, wasOn: false, drops: 0, ends: 0, last: null, overflows: 0, traits: null, form: null, done: 0 },
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

// Couleur de la scène : l'encre de l'escale en cours (state.ink, qui glisse d'une escale à l'autre, voir journey.js).
// Une seule couleur à la fois ; les joueurs y ajoutent une teinte plus claire de la même encre.
export function actColors() { const ink = state.ink; return { ink, accent: ink.map((v) => 0.5 + 0.5 * v) }; }

export function clamp(v, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
// Lissage exponentiel avec temps de montée et de descente distincts.
export function smooth(cur, target, dt, tauUp, tauDown = tauUp) {
  const tau = target > cur ? tauUp : tauDown;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}
rebuildSectorMap();
