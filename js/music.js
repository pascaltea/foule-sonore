// Moteur musical génératif (Web Audio, aucun sample).
// Un bourdon commun + un instrument par secteur, joué par la foule qui s'y trouve.
// Tous les secteurs partagent tempo, gamme et grille d'accords.
import { GW, GH, MAX_SECTORS, state, settings, clamp } from './state.js';

export const SCALES = {
  pentaMin: { label: 'Pentatonique mineure', iv: [0, 3, 5, 7, 10] },
  pentaMaj: { label: 'Pentatonique majeure', iv: [0, 2, 4, 7, 9] },
  dorien: { label: 'Dorien', iv: [0, 2, 3, 5, 7, 9, 10] },
  mineur: { label: 'Mineure', iv: [0, 2, 3, 5, 7, 8, 10] },
  majeur: { label: 'Majeure', iv: [0, 2, 4, 5, 7, 9, 11] },
  yaman: { label: 'Yaman (Inde)', iv: [0, 2, 4, 6, 7, 9, 11] },
  hirajoshi: { label: 'Hirajoshi (Japon)', iv: [0, 2, 3, 7, 8] },
  hijaz: { label: 'Hijaz (Levant)', iv: [0, 1, 4, 5, 7, 8, 10] },
};
export const KEYS = ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const PROG = { 5: [0, 3, 1, 4], 7: [0, 5, 3, 4] };
const UNISON = [0, 3, 6, 8, 10, 12, 14];        // rythme commun à tous les instruments pendant le climax
const UNI_DEG = [0, 2, 4, 0, 4, 2, 4];

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[(Math.random() * a.length) | 0];

let ac = null, master, limiter, analyser, duck, revIn, dlyIn, dly, noiseBuf, pad;
const bus = {}, chan = [];
let bpm = 90, nextT = 0, step = 0, bar = -1, chordIdx = 0;
let lastTierUps = 0, lastSig = '', lastLift = 0, lastDrop = 0, lastHush = 0, lastEnd = 0;
const lastPeak = new Int32Array(MAX_SECTORS);
const queue = [];
const meter = new Float32Array(1024);

function gain(v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
function send(src, dest, v) { src.connect(gain(v, dest)); }
function biquad(type, f, q = 0.7, db = 0) {
  const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = db; return b;
}

export async function init() {
  if (ac) { await ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  await ac.resume();
  build();
  nextT = ac.currentTime + 0.15;
  setInterval(tick, 25);
  state.music.running = true;
}

// Atelier des gestes (atelier.html) : le même moteur de sons, sans la partition automatique. La scène ne s'en sert pas.
export async function initLab() {
  if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); build(); }
  await ac.resume();
  pad.level.gain.value = 0; pad.lfoGain.gain.value = 0; master.gain.value = 0.4;
  return { ac, chan, INST, PRESETS, SCALES, mtof, deg2midi, v: { kick, snare, hat, crash, drum, tap, thump, pianoNote, bassNote, violinNote } };
}

function build() {
  // Sortie : volume général -> limiteur -> haut-parleurs.
  limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -7; limiter.knee.value = 2; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.25;
  analyser = ac.createAnalyser(); analyser.fftSize = 1024;
  master = gain(0, limiter);
  limiter.connect(analyser); analyser.connect(ac.destination);

  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Réverbération : réponse impulsionnelle synthétique.
  const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  const rev = ac.createConvolver(); rev.buffer = ir;
  revIn = gain(1, rev); rev.connect(gain(0.7, master));

  // Écho rythmique.
  dly = ac.createDelay(1.5); dly.delayTime.value = 0.375;
  const fb = gain(0.32), lp = biquad('lowpass', 2400);
  dlyIn = gain(1, dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); dly.connect(gain(0.5, master));

  duck = gain(1, master);
  bus.pad = gain(1, duck); bus.fx = gain(0.9, master);
  send(bus.pad, revIn, 0.5); send(bus.fx, revIn, 0.6);

  // Une tranche de mixage par secteur : entrée -> niveau -> panoramique -> sortie, + départs d'effets.
  chan.length = 0;
  for (let i = 0; i < MAX_SECTORS; i++) {
    const pan = ac.createStereoPanner(); pan.connect(master);
    // Le filtre s'ouvre avec les bras de la personne : bras serrés = son feutré, bras ouverts = son clair.
    const level = gain(0, pan), filt = biquad('lowpass', 16000, 0.5), input = gain(1, filt);
    filt.connect(level);
    const rv = gain(0, revIn), dl = gain(0, dlyIn);
    pan.connect(rv); pan.connect(dl);
    chan.push({ in: input, level, filt, pan, rv, dl, inst: '', on: false, accent: false, pos: 0, viol: null });
  }
  buildPad();
}

function buildPad() {
  const filter = biquad('lowpass', 350, 0.6);
  const level = gain(0.2, bus.pad); filter.connect(level);
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
  const lfoGain = gain(0.04, level.gain); lfo.connect(lfoGain); lfo.start();
  const voices = [];
  for (let v = 0; v < 4; v++) {
    const g = gain(v === 0 ? 0.2 : 0.11, filter), o = [];
    for (let k = 0; k < 2; k++) {
      const osc = ac.createOscillator(); osc.type = v === 0 && k === 0 ? 'sine' : 'sawtooth';
      osc.frequency.value = 110; osc.connect(g); osc.start(); o.push(osc);
    }
    voices.push(o);
  }
  pad = { filter, level, lfoGain, voices };
}

function scaleInfo() {
  const iv = (SCALES[settings.scale] || SCALES.pentaMin).iv;
  return { iv, n: iv.length, prog: PRESETS[settings.preset]?.prog || PROG[iv.length], base: 36 + settings.key };
}
function deg2midi(deg, base, iv) {
  const n = iv.length;
  return base + 12 * Math.floor(deg / n) + iv[((deg % n) + n) % n];
}

function setChord(t) {
  const { iv, n, prog, base } = scaleInfo(), r = prog[chordIdx];
  [r - n, r, r + 2, r + 4].forEach((deg, i) => {
    const f = mtof(deg2midi(deg, base + 12, iv));
    pad.voices[i].forEach((o) => o.frequency.setTargetAtTime(f, t, 0.12));
  });
  queue.push({ t, chord: chordIdx });
}

// ---------- Voix élémentaires ----------
function voice({ type = 'sine', f, fFrom, glide = 0.04, t, dur, vol, dest, a = 0.003, r = 0.08, cutoff, cutTo, cutT = 0.3, det = 0 }) {
  const o = ac.createOscillator(); o.type = type; o.detune.value = det;
  if (fFrom) { o.frequency.setValueAtTime(fFrom, t); o.frequency.exponentialRampToValueAtTime(f, t + glide); }
  else o.frequency.setValueAtTime(f, t);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(0, t + Math.max(a, dur), r);
  let n = o;
  if (cutoff) {
    const fl = biquad('lowpass', Math.min(cutoff, 18000));
    if (cutTo) { fl.frequency.setValueAtTime(Math.min(cutoff, 18000), t); fl.frequency.exponentialRampToValueAtTime(cutTo, t + cutT); }
    o.connect(fl); n = fl;
  }
  n.connect(g); g.connect(dest);
  o.start(t); o.stop(t + Math.max(a, dur) + r * 7 + 0.05);
}

function noise({ t, vol, dest, type = 'highpass', f = 8000, fTo, q = 0.7, a = 0.001, r = 0.02 }) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = biquad(type, f, q);
  fl.frequency.setValueAtTime(f, t);
  if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + a + r * 3);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(0, t + a, r);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + a + r * 7 + 0.05);
}

const drum = (t, f, vol, dest, decay = 0.12) => {      // peau accordée : conga, tom
  voice({ f, fFrom: f * 1.7, glide: 0.035, t, dur: 0.01, vol, dest, a: 0.002, r: decay });
  noise({ t, vol: vol * 0.25, dest, type: 'bandpass', f: f * 6, q: 1, r: 0.012 });
};
// Une frappe grave ne vit pas que dans l'extrême grave : on lui ajoute son octave et un claquement d'attaque, pour
// qu'elle reste présente sur de petites enceintes.
function thump(t, f, vol, dest, decay, click = 1800) {
  voice({ type: 'triangle', f: f * 2, fFrom: f * 4, glide: 0.05, t, dur: 0.012, vol: vol * 0.55, dest, a: 0.002, r: decay * 0.55 });
  noise({ t, vol: vol * 0.4, dest, type: 'bandpass', f: click, q: 0.9, r: 0.012 });
}
function kick(t, vol, dest, pump) {
  voice({ f: 52, fFrom: 160, glide: 0.1, t, dur: 0.02, vol, dest, a: 0.002, r: 0.11 }); thump(t, 52, vol, dest, 0.11, 2200);
  if (pump) { duck.gain.setTargetAtTime(0.5, t, 0.006); duck.gain.setTargetAtTime(1, t + 0.06, 0.09); }
}
const snare = (t, vol, dest) => {
  noise({ t, vol, dest, type: 'bandpass', f: 1900, q: 0.8, r: 0.05 });
  voice({ type: 'triangle', f: 185, t, dur: 0.01, vol: vol * 0.6, dest, r: 0.03 });
};
const hat = (t, vol, dest, open) => noise({ t, vol, dest, f: open ? 6000 : 8500, a: open ? 0.004 : 0.001, r: open ? 0.07 : 0.014 });
const crash = (t, vol, dest) => noise({ t, vol, dest, f: 4500, a: 0.002, r: 0.35 });
function marimbaNote(t, f, vol, dest) {
  voice({ f, t, dur: 0.01, vol, dest, a: 0.002, r: 0.11 });
  voice({ f: f * 4, t, dur: 0.005, vol: vol * 0.22, dest, a: 0.001, r: 0.025 });
}
function bellNote(t, f, vol, dest, long = 0.5) {
  voice({ f, t, dur: 0.01, vol, dest, a: 0.002, r: long });
  voice({ f: f * 2.76, t, dur: 0.01, vol: vol * 0.3, dest, a: 0.002, r: long * 0.5 });
  voice({ f: f * 5.4, t, dur: 0.005, vol: vol * 0.12, dest, a: 0.001, r: long * 0.2 });
}
// Piano : marteau (bruit bref), cordes légèrement désaccordées, timbre qui s'assombrit en résonnant.
function pianoNote(t, f, vol, dest, long = 0.45) {
  const decay = long * clamp(330 / f, 0.5, 1.6) ** 0.5;
  for (const det of [-5, 4]) {
    voice({ type: 'sawtooth', f, t, dur: 0.015, vol: vol * 0.3, dest, a: 0.003, r: decay, cutoff: f * 7, cutTo: f * 1.6, cutT: 0.35, det });
  }
  voice({ type: 'triangle', f, t, dur: 0.02, vol: vol * 0.5, dest, a: 0.002, r: decay * 1.3 });
  voice({ f: f * 2.003, t, dur: 0.01, vol: vol * 0.1, dest, a: 0.002, r: decay * 0.5 });
  noise({ t, vol: vol * 0.1, dest, type: 'bandpass', f: Math.min(7000, f * 5), q: 1, r: 0.008 });
}
function bassNote(t, f, vol, dest, dur) {
  voice({ type: 'sawtooth', f, t, dur, vol: vol * 0.55, dest, a: 0.004, r: 0.06, cutoff: f * 7, cutTo: f * 1.8, cutT: 0.18 });
  voice({ f, t, dur, vol: vol * 0.7, dest, a: 0.004, r: 0.07 });
}
function choirChord(t, freqs, vol, dest, dur, a) {
  for (const f of freqs) {
    for (const det of [-9, 8]) voice({ type: 'sawtooth', f, t, dur, vol: vol * 0.16, dest, a, r: 0.22, cutoff: 1500, det });
    voice({ f: f * 2, t, dur, vol: vol * 0.05, dest, a, r: 0.22 });
  }
}
// Violon : voix tenue par secteur (deux cordes frottées, vibrato, résonance de caisse), liée d'une note à l'autre.
function makeViolin(c) {
  const g = gain(0, c.in), hp = biquad('highpass', 220), pk = biquad('peaking', 2600, 1.2, 7), lp = biquad('lowpass', 4200);
  lp.connect(pk); pk.connect(hp); hp.connect(g);
  const lfo = ac.createOscillator(); lfo.frequency.value = 5.6;
  const vib = gain(12); lfo.connect(vib); lfo.start();
  const o = [-5, 5].map((det) => {
    const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.detune.value = det;
    vib.connect(osc.detune); osc.connect(lp); osc.start(); return osc;
  });
  return { kind: 'violin', o, g, end: -1, nodes: [lfo, ...o] };
}
function violinNote(c, t, f, vol, len) {
  const v = c.viol && c.viol.kind === 'violin' ? c.viol : (c.viol = makeViolin(c)), legato = t < v.end + 0.03;
  v.o.forEach((o) => { if (legato) o.frequency.setTargetAtTime(f, t, 0.03); else o.frequency.setValueAtTime(f, t); });
  v.g.gain.cancelScheduledValues(t);
  v.g.gain.setTargetAtTime(vol, t, legato ? 0.03 : 0.07);     // attaque lente de l'archet
  v.g.gain.setTargetAtTime(0, t + len, 0.1);
  v.end = t + len;
}
function impact(t, vol) {
  voice({ f: 32, fFrom: 120, glide: 0.6, t, dur: 0.05, vol, dest: bus.fx, a: 0.003, r: 0.45 });
  noise({ t, vol: vol * 0.5, dest: bus.fx, type: 'lowpass', f: 3000, fTo: 200, a: 0.002, r: 0.3 });
  [0, 0.09, 0.18].forEach((d, i) => drum(t + d, 70 - i * 9, vol * 0.5, bus.fx, 0.25));
}
const riser = (t, dur) => noise({ t, vol: 0.3, dest: bus.fx, type: 'bandpass', f: 400, fTo: 7000, q: 2, a: dur, r: 0.04 });

// Rythme euclidien : k frappes réparties sur 16 pas.
const euclid = (k, s, rot) => k > 0 && ((s + rot) * k) % 16 < k;

// ---------- Instruments ----------
// play(x) joue (ou non) le pas courant et renvoie true si une note a sonné ; accent(x) répond à un pic du secteur.
// x : t (instant), s16 (pas dans la mesure), sd (durée d'un pas), e (énergie), lvl (0 noires, 1 croches, 2 doubles),
//     coh (cohérence), oct (registre -1..1), r/n/iv/base (harmonie), climax, uni (rang dans le rythme d'unisson),
//     hit (le secteur joue une note sur ce pas), d (entrée de la tranche), c (tranche).
function melDeg(x) {
  if (x.climax) return x.r + UNI_DEG[x.uni];                               // unisson : tout le monde la même note
  if (Math.random() < 0.15 + 0.85 * x.coh) return x.r + [0, 2, 4, x.n, 4, 2, x.n + 2, 4][x.c.pos++ % 8];   // phrase ordonnée
  return x.r + ((Math.random() * (x.n + 3)) | 0);                          // notes éparses
}
const note = (x, deg, baseOct) => mtof(deg2midi(deg, x.base + baseOct + 12 * x.oct, x.iv));
const stepsLen = (x) => (x.climax ? 2 : x.lvl === 0 ? 4 : x.lvl === 1 ? 2 : 1) * x.sd;

const INST = {
  drums: {
    label: 'Batterie', level: 0.95, rev: 0.1, dly: 0, perc: true,
    play(x) {
      const { t, s16, lvl, e, d, climax, coh } = x, v = 0.6 + 0.4 * e;
      let p = false;
      if (climax) {
        if (x.uni >= 0) { if (s16 % 8 === 0 || s16 === 10) kick(t, 0.9, d, true); else snare(t, 0.5, d); p = true; }
        if (s16 % 2 === 0) hat(t, 0.16, d, s16 % 4 === 2);
        return p;
      }
      const k = lvl === 2 ? s16 % 4 === 0 : lvl === 1 ? [0, 8, 10].includes(s16) : s16 === 0 || s16 === 8;
      if (k) { kick(t, 0.9 * v, d, lvl === 2); p = true; }
      if ((s16 === 4 || s16 === 12) && (lvl >= 1 || e > 0.4)) { snare(t, 0.45 * v, d); p = true; }
      if (lvl === 0 ? s16 % 4 === 2 : lvl === 1 ? s16 % 2 === 0 : true) hat(t, (s16 % 4 === 0 ? 0.2 : 0.12) * v, d, lvl === 2 && s16 % 4 === 2);
      // Toms : fin de phrase quand ça joue serré, frappes libres quand la foule est dispersée.
      const tom = (s) => mtof(x.base + 19 + 12 * x.oct - s * 4);
      if (lvl >= 1 && bar % 4 === 3 && s16 >= 12) { drum(t, tom(s16 - 12), 0.5 * v, d, 0.14); p = true; }
      else if (s16 % 2 && Math.random() < (1 - coh) * 0.12 * (lvl + 1)) { drum(t, tom((Math.random() * 3) | 0), 0.35 * v, d, 0.12); p = true; }
      return p;
    },
    accent(x) {      // roulement de toms + cymbale
      for (let i = 0; i < 6; i++) drum(x.t + i * x.sd / 2, mtof(x.base + 26 - i * 3), 0.4 + i * 0.06, x.d, 0.12);
      crash(x.t + 3 * x.sd, 0.3, x.d); kick(x.t + 3 * x.sd, 0.9, x.d, true);
    },
  },
  piano: {
    label: 'Piano', level: 0.8, rev: 0.3, dly: 0.08,
    play(x) {
      if (!x.hit) return false;
      pianoNote(x.t, note(x, melDeg(x), 24), 0.5, x.d);
      if (x.s16 === 0 && !x.climax) pianoNote(x.t, mtof(deg2midi(x.r - x.n, x.base + 12, x.iv)), 0.4, x.d, 0.8);   // main gauche
      return true;
    },
    accent(x) {      // accord plaqué
      [x.r - x.n, x.r, x.r + 2, x.r + 4, x.r + x.n].forEach((dg, i) => pianoNote(x.t + i * 0.006, note(x, dg, 24), 0.42, x.d, 1.1));
    },
  },
  violin: {
    label: 'Violon', level: 0.75, rev: 0.45, dly: 0.1,
    play(x) {
      if (!x.hit) return false;
      violinNote(x.c, x.t, note(x, melDeg(x), 24), 0.24, stepsLen(x) * 1.35);
      return true;
    },
    accent(x) {      // trait d'archet ascendant
      [0, 1, 2, 3, 4, x.n].forEach((dg, i) => violinNote(x.c, x.t + i * x.sd / 2, note(x, x.r + dg, 24), 0.3, i === 5 ? x.sd * 4 : x.sd));
    },
  },
  bass: {
    label: 'Basse', level: 0.5, rev: 0.05, dly: 0,
    play(x) {
      const { s16, lvl } = x;
      const on = x.climax ? x.uni >= 0 : (lvl === 0 ? [0, 8] : lvl === 1 ? [0, 6, 8, 14] : [0, 3, 6, 8, 11, 14]).includes(s16);
      if (!on) return false;
      let dg = x.r - x.n;
      if (x.climax) dg += UNI_DEG[x.uni];
      else if (s16 % 8) dg += Math.random() < x.coh ? (s16 === 14 ? 4 : 2) : pick([0, 2, 4, x.n - 1]);
      bassNote(x.t, mtof(deg2midi(dg, x.base + 12 + (x.oct > 0 ? 12 : 0), x.iv)), 0.7, x.d, stepsLen(x) * 0.7);
      return true;
    },
    accent(x) {      // glissé d'octave
      const f = mtof(deg2midi(x.r - x.n, x.base + 12, x.iv));
      voice({ type: 'sawtooth', f: f * 2, fFrom: f, glide: 0.25, t: x.t, dur: 0.4, vol: 0.5, dest: x.d, cutoff: f * 8, cutTo: f * 3, cutT: 0.5, r: 0.1 });
      voice({ f: f * 2, fFrom: f, glide: 0.25, t: x.t, dur: 0.4, vol: 0.6, dest: x.d, r: 0.1 });
    },
  },
  marimba: {
    label: 'Marimba', level: 0.85, rev: 0.25, dly: 0.3,
    play(x) { if (!x.hit) return false; marimbaNote(x.t, note(x, melDeg(x), 24), 0.45, x.d); return true; },
    accent(x) { for (let i = 0; i < 6; i++) marimbaNote(x.t + i * x.sd / 2, note(x, x.r + i * 2, 24), 0.4 + i * 0.03, x.d); },
  },
  bells: {
    label: 'Cloches', level: 0.75, rev: 0.4, dly: 0.3,
    play(x) {
      if (!x.hit || (x.s16 % 2 && !x.climax)) return false;
      bellNote(x.t, note(x, melDeg(x), 36), 0.3, x.d, 0.25 + 0.12 * (2 - x.lvl));
      return true;
    },
    accent(x) { [x.r, x.r + 2, x.r + 4].forEach((dg, i) => bellNote(x.t + i * 0.03, note(x, dg, 36), 0.26, x.d, 1)); },
  },
  congas: {
    label: 'Congas', level: 1.25, rev: 0.12, dly: 0, perc: true,
    play(x) {
      const { t, s16, e, d } = x, hi = note(x, x.r + 2, 12), lo = note(x, x.r, 12);
      if (x.climax) { if (x.uni < 0) return false; drum(t, x.uni % 2 ? hi : lo, 0.5, d, 0.1); return true; }
      const k = Math.round(1 + e * 4 + x.lvl * 2.5);
      let p = false;
      if (euclid(k, s16, 0)) { drum(t, hi, 0.3 + 0.2 * e, d, 0.09); p = true; }
      if (euclid(Math.round(k / 2), s16, 5)) { drum(t, lo, 0.35 + 0.2 * e, d, 0.12); p = true; }
      return p;
    },
    accent(x) { for (let i = 0; i < 6; i++) drum(x.t + i * x.sd / 2, note(x, x.r + (i % 3) * 2, 12), 0.35 + i * 0.05, x.d, 0.09); },
  },
  choir: {
    label: 'Chœur', level: 1.3, rev: 0.6, dly: 0,
    play(x) {
      const { s16, lvl, sd } = x;
      const steps = x.climax ? (x.uni >= 0 ? 1.6 : 0) : lvl === 0 ? (s16 === 0 ? 16 : 0) : lvl === 1 ? (s16 % 8 === 0 ? 8 : 0) : (s16 % 4 === 0 ? 4 : 0);
      if (!steps) return false;
      const top = x.climax ? UNI_DEG[x.uni] : 4;
      const len = steps * sd * 0.9;
      choirChord(x.t, [x.r, x.r + 2, x.r + top].map((dg) => note(x, dg, 24)), 0.6, x.d, len, Math.min(0.3, len * 0.3));
      return true;
    },
    accent(x) { choirChord(x.t, [x.r, x.r + 2, x.r + 4, x.r + x.n].map((dg) => note(x, dg, 24)), 0.7, x.d, x.sd * 8, 0.25); },
  },
};

// ---------- Instruments du monde (toujours synthétisés, aucun sample) ----------
// Corde pincée : kora, koto, oud. bright = brillance de l'attaque, decay = tenue, from = note d'où l'on glisse.
function pluck(t, f, vol, dest, { bright = 6, decay = 0.4, det = 4, body = 0.5, from } = {}) {
  const d = decay * clamp(330 / f, 0.5, 1.6) ** 0.5, fFrom = from ? f * from : undefined;
  for (const dc of [-det, det]) {
    voice({ type: 'sawtooth', f, fFrom, glide: 0.07, t, dur: 0.012, vol: vol * 0.3, dest, a: 0.002, r: d, cutoff: f * bright, cutTo: f * 1.5, cutT: d * 0.6, det: dc });
  }
  voice({ type: 'triangle', f, fFrom, glide: 0.07, t, dur: 0.015, vol: vol * body, dest, a: 0.002, r: d * 1.2 });
  noise({ t, vol: vol * 0.12, dest, type: 'bandpass', f: Math.min(8000, f * 6), q: 1.5, r: 0.006 });
}
// Sitar : corde pincée dont le chevalet « frise » (une résonance qui descend le long de la note), léger glissé d'attaque.
function sitarNote(t, f, vol, dest, long = 0.7) {
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  const bp = biquad('bandpass', f * 9, 5), lp = biquad('lowpass', f * 3.5), g = ac.createGain(), gb = ac.createGain();
  bp.frequency.setValueAtTime(Math.min(9000, f * 11), t); bp.frequency.exponentialRampToValueAtTime(f * 2.5, t + long);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 1.5, t + 0.004); g.gain.setTargetAtTime(0, t + 0.03, long * 0.45);
  gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(vol * 0.45, t + 0.004); gb.gain.setTargetAtTime(0, t + 0.03, long * 0.6);
  o.connect(bp); bp.connect(g); g.connect(dest); o.connect(lp); lp.connect(gb); gb.connect(dest);
  o.start(t); o.stop(t + long * 4 + 0.1);
  noise({ t, vol: vol * 0.15, dest, type: 'bandpass', f: Math.min(9000, f * 7), q: 2, r: 0.005 });
}
const steelNote = (t, f, vol, dest, long = 0.3) => {      // steel pan : fondamentale, octave et douzième qui s'éteignent vite
  voice({ f, fFrom: f * 1.012, glide: 0.05, t, dur: 0.01, vol, dest, a: 0.002, r: long });
  voice({ f: f * 2, t, dur: 0.01, vol: vol * 0.42, dest, a: 0.002, r: long * 0.6 });
  voice({ f: f * 3.01, t, dur: 0.006, vol: vol * 0.14, dest, a: 0.001, r: long * 0.3 });
};
const balafonNote = (t, f, vol, dest) => {                // lame de bois + calebasse qui grésille
  voice({ f, t, dur: 0.008, vol, dest, a: 0.001, r: 0.085 });
  voice({ f: f * 3.9, t, dur: 0.004, vol: vol * 0.2, dest, a: 0.001, r: 0.02 });
  noise({ t, vol: vol * 0.16, dest, type: 'bandpass', f: Math.min(6000, f * 3), q: 5, r: 0.03 });
};
// Flûtes : voix tenue par place (souffle + son), liée d'une note à l'autre comme le violon.
const WIND = {
  bansuri: { breath: 0.05, vib: 5.2, depth: 7, glide: 0.05, lp: 3200, scoop: 0.985 },
  shakuhachi: { breath: 0.17, vib: 4.2, depth: 15, glide: 0.09, lp: 2400, scoop: 0.93 },
  ney: { breath: 0.12, vib: 4.8, depth: 10, glide: 0.06, lp: 2700, scoop: 0.97 },
};
function makeWind(c, kind) {
  const P = WIND[kind], g = gain(0, c.in), lp = biquad('lowpass', P.lp);
  lp.connect(g);
  const lfo = ac.createOscillator(); lfo.frequency.value = P.vib;
  const vib = gain(P.depth); lfo.connect(vib); lfo.start();
  const mk = (type, v) => { const o = ac.createOscillator(); o.type = type; vib.connect(o.detune); o.connect(gain(v, lp)); o.start(); return o; };
  const o = [mk('sine', 1), mk('triangle', 0.22)], o2 = mk('sine', 0.1);
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const bp = biquad('bandpass', 1200, 1.6); src.connect(bp); bp.connect(gain(P.breath * 9, lp)); src.start();
  return { kind, o, o2, bp, g, P, end: -1, nodes: [lfo, src, o2, ...o] };
}
function windNote(c, t, f, vol, len, kind) {
  const v = c.viol && c.viol.kind === kind ? c.viol : (c.viol = makeWind(c, kind)), P = v.P, legato = t < v.end + 0.03;
  const set = (p, val) => {
    p.cancelScheduledValues(t);
    if (legato) p.setTargetAtTime(val, t, P.glide);
    else { p.setValueAtTime(val * P.scoop, t); p.exponentialRampToValueAtTime(val, t + 0.08); }
  };
  v.o.forEach((o) => set(o.frequency, f)); set(v.o2.frequency, f * 2); set(v.bp.frequency, Math.min(6000, f * 2));
  v.g.gain.cancelScheduledValues(t);
  v.g.gain.setTargetAtTime(vol, t, legato ? 0.04 : 0.06);
  v.g.gain.setTargetAtTime(0, t + len, 0.12);
  v.end = t + len;
}
const tap = (t, vol, dest, f = 3000, q = 1.2, r = 0.012) => noise({ t, vol, dest, type: 'bandpass', f, q, r });

// Percussion à la main : un motif de 16 pas par niveau de vitesse. Majuscule = frappe sûre, minuscule = frappe
// légère qui n'arrive que si l'on bouge assez. u = les deux frappes de l'unisson, g = frappe fantôme.
function perc(label, level, pats, strokes) {
  return {
    label, level, rev: 0.14, dly: 0, perc: true, strokes, pats,
    play(x) {
      if (x.climax) { if (x.uni < 0) return false; strokes[pats.u[x.uni % 2]](x, 1); return true; }
      const ch = pats[x.lvl][x.s16];
      if (ch === '.') {
        if (x.s16 % 2 && Math.random() < (x.e - 0.45) * 0.35) { strokes[pats.g](x, 0.4); return true; }
        return false;
      }
      const up = ch.toUpperCase(), soft = ch !== up;
      if (soft && Math.random() > 0.2 + 0.8 * x.e) return false;
      strokes[up](x, (soft ? 0.55 : 1) * (0.65 + 0.35 * x.e));
      return true;
    },
    accent(x) { for (let i = 0; i < 6; i++) strokes[pats.u[i % 2 ? 1 : 0]]({ ...x, t: x.t + i * x.sd / 2 }, 0.5 + i * 0.1); },
  };
}
// Mélodique : chaque instrument ne décrit que sa note ; le phrasé (énergie, vitesse, régularité) est commun.
function mel(label, level, rev, dly, oct, one, extra = {}) {
  return {
    label, level, rev, dly, one, oct,
    play(x) { if (!x.hit || (extra.gate && !extra.gate(x))) return false; one(x, note(x, melDeg(x), oct), 1); extra.under?.(x); return true; },
    accent: extra.accent || ((x) => { for (let i = 0; i < 6; i++) one({ ...x, t: x.t + i * x.sd / 2 }, note(x, x.r + i, oct), 0.8 + i * 0.04); }),
  };
}

Object.assign(INST, {
  djembe: perc('Djembé', 1.25, { 0: 'B...T...B.t.T...', 1: 'B.tSB.T.B.tSt.T.', 2: 'B.tSBtTsB.tSTtTs', u: 'BS', g: 'T' }, {
    B: (x, v) => { voice({ f: 78, fFrom: 135, glide: 0.05, t: x.t, dur: 0.02, vol: 0.9 * v, dest: x.d, a: 0.002, r: 0.13 }); thump(x.t, 78, 0.8 * v, x.d, 0.13, 1200); },
    T: (x, v) => drum(x.t, 235, 0.55 * v, x.d, 0.07),
    S: (x, v) => { tap(x.t, 0.6 * v, x.d, 2600, 0.9, 0.02); voice({ f: 430, t: x.t, dur: 0.004, vol: 0.25 * v, dest: x.d, r: 0.02 }); },
  }),
  tabla: perc('Tabla', 1.25, { 0: 'D...N...D...N.t.', 1: 'D.t.N.t.G.N.N.tt', 2: 'D.tNt.NtG.tNtNtt', u: 'DN', g: 'T' }, (() => {
    const G = (x, v) => { voice({ f: 84, fFrom: 58, glide: 0.11, t: x.t, dur: 0.05, vol: 0.85 * v, dest: x.d, a: 0.003, r: 0.13 }); voice({ type: 'triangle', f: 168, fFrom: 116, glide: 0.11, t: x.t, dur: 0.04, vol: 0.4 * v, dest: x.d, a: 0.003, r: 0.09 }); };
    const N = (x, v) => { const f = mtof(x.base + 36); voice({ f, t: x.t, dur: 0.006, vol: 0.4 * v, dest: x.d, a: 0.001, r: 0.15 }); voice({ f: f * 2.01, t: x.t, dur: 0.004, vol: 0.14 * v, dest: x.d, a: 0.001, r: 0.08 }); tap(x.t, 0.2 * v, x.d, 4000, 2, 0.006); };
    return { G, N, T: (x, v) => tap(x.t, 0.4 * v, x.d, 1900, 2.5, 0.009), D: (x, v) => { G(x, v); N(x, v); } };
  })()),
  taiko: perc('Taïko', 1.15, { 0: 'D.......D...k...', 1: 'D...k.k.D.d.k...', 2: 'D.k.D.kkD.d.DkDk', u: 'DK', g: 'K' }, {
    // Grand tambour : une peau grave, son octave qui porte, et le bois de la baguette.
    D: (x, v) => { voice({ f: 68, fFrom: 140, glide: 0.07, t: x.t, dur: 0.03, vol: v, dest: x.d, a: 0.002, r: 0.3 }); thump(x.t, 68, 1.1 * v, x.d, 0.3, 1500); noise({ t: x.t, vol: 0.4 * v, dest: x.d, type: 'lowpass', f: 1400, r: 0.035 }); },
    K: (x, v) => { tap(x.t, 0.8 * v, x.d, 2300, 3, 0.012); voice({ f: 880, t: x.t, dur: 0.003, vol: 0.32 * v, dest: x.d, r: 0.018 }); },
  }),
  darbuka: perc('Darbouka', 1.8, { 0: 'D.T...T.D...T...', 1: 'D.T.k.T.D.k.T.k.', 2: 'D.TkkkT.DkkkT.Tk', u: 'DT', g: 'K' }, {
    D: (x, v) => { drum(x.t, 96, 0.9 * v, x.d, 0.11); thump(x.t, 96, 0.6 * v, x.d, 0.11, 1300); },
    T: (x, v) => { tap(x.t, 0.6 * v, x.d, 3800, 1.5, 0.018); voice({ f: 640, t: x.t, dur: 0.004, vol: 0.22 * v, dest: x.d, r: 0.02 }); },
    K: (x, v) => tap(x.t, 0.38 * v, x.d, 4600, 2, 0.01),
  }),
  balafon: mel('Balafon', 0.9, 0.2, 0.22, 24, (x, f, v) => balafonNote(x.t, f, 0.5 * v, x.d)),
  kora: mel('Kora', 0.8, 0.3, 0.26, 24, (x, f, v) => pluck(x.t, f, 0.5 * v, x.d, { bright: 8, decay: 0.5, det: 5 }), {
    under: (x) => { if (x.s16 % 8 === 0 && !x.climax) pluck(x.t, note(x, x.r - x.n, 24), 0.4, x.d, { bright: 5, decay: 0.7 }); },      // corde grave du pouce
    accent: (x) => { for (let i = 0; i < 7; i++) pluck(x.t + i * x.sd / 3, note(x, x.r + x.n + 2 - i, 24), 0.42, x.d, { bright: 8, decay: 0.5 }); },
  }),
  sitar: mel('Sitar', 1.5, 0.32, 0.18, 12, (x, f, v) => sitarNote(x.t, f, 0.45 * v, x.d, 0.5 + 0.25 * (2 - x.lvl)), {
    under: (x) => { if (x.s16 === 0 && !x.climax) sitarNote(x.t + x.sd / 2, mtof(x.base + 36), 0.16, x.d, 0.5); },                      // cordes de bourdon
    accent: (x) => { for (let i = 0; i < 8; i++) sitarNote(x.t + i * x.sd / 3, note(x, x.r + i, 12), 0.34, x.d, i === 7 ? 1.1 : 0.3); },
  }),
  bansuri: mel('Bansuri (flûte)', 0.8, 0.45, 0.12, 36, (x, f, v) => windNote(x.c, x.t, f, 0.3 * v, stepsLen(x) * 1.4, 'bansuri')),
  koto: mel('Koto', 0.8, 0.35, 0.2, 24, (x, f, v) => pluck(x.t, f, 0.5 * v, x.d, { bright: 10, decay: 0.75, det: 3, body: 0.35, from: Math.random() < 0.22 ? 0.944 : undefined }), {
    accent: (x) => { for (let i = 0; i < 9; i++) pluck(x.t + i * x.sd / 4, note(x, x.r + i, 24), 0.36, x.d, { bright: 10, decay: 0.6 }); },   // glissando
  }),
  shakuhachi: mel('Shakuhachi (flûte)', 0.85, 0.55, 0.1, 24, (x, f, v) => windNote(x.c, x.t, f, 0.32 * v, stepsLen(x) * 2.2, 'shakuhachi'), { gate: (x) => x.climax || x.lvl === 2 || x.s16 % 4 === 0 }),
  oud: mel('Oud', 0.58, 0.25, 0.1, 12, (x, f, v) => {
    const o = { bright: 4.5, decay: 0.36, det: 6, body: 0.7 };
    pluck(x.t, f, 0.55 * v, x.d, o);
    if (x.lvl === 0 && !x.climax) for (let i = 1; i < 4; i++) pluck(x.t + i * x.sd / 2, f, 0.3 * v, x.d, o);                              // trémolo sur les notes longues
  }, { under: (x) => { if (x.s16 === 0 && !x.climax) pluck(x.t, note(x, x.r - x.n, 12), 0.45, x.d, { bright: 4, decay: 0.6, body: 0.8 }); } }),
  ney: mel('Ney (flûte)', 0.8, 0.5, 0.14, 24, (x, f, v) => windNote(x.c, x.t, f, 0.3 * v, stepsLen(x) * 1.6, 'ney')),
  steelpan: mel('Steel pan', 0.65, 0.3, 0.2, 24, (x, f, v) => {
    steelNote(x.t, f, 0.42 * v, x.d);
    if (x.lvl === 0 && !x.climax) steelNote(x.t + x.sd, f, 0.26 * v, x.d);                                                              // roulement
  }),
});

// Configurations : des trios pensés pour sonner ensemble dès la première note (rythme à gauche, harmonie au centre,
// chant à droite), chacun avec sa gamme, sa tonalité, sa plage de tempo et, au besoin, sa propre grille d'accords.
export const PRESETS = {
  geneve: { name: 'Genève', sub: 'le studio', insts: ['drums', 'piano', 'violin'], scale: 'pentaMin', key: 9, bpm: [72, 132], ink: [0.03, 0.6, 0.36] },
  mali: { name: 'Mali', sub: 'Afrique de l\'Ouest', insts: ['djembe', 'balafon', 'kora'], scale: 'pentaMaj', key: 5, bpm: [86, 132], ink: [1, 0.46, 0.04] },
  inde: { name: 'Inde', sub: 'raga du soir', insts: ['tabla', 'sitar', 'bansuri'], scale: 'yaman', key: 2, bpm: [66, 124], prog: [0, 0, 0, 0], ink: [0.95, 0.36, 0.9] },
  japon: { name: 'Japon', sub: 'gamme hirajoshi', insts: ['taiko', 'koto', 'shakuhachi'], scale: 'hirajoshi', key: 2, bpm: [60, 110], prog: [0, 0, 3, 0], ink: [0.8, 0.85, 0.96] },
  levant: { name: 'Levant', sub: 'maqam hijaz', insts: ['darbuka', 'oud', 'ney'], scale: 'hijaz', key: 2, bpm: [76, 128], prog: [0, 0, 3, 0], ink: [0.04, 0.5, 0.86] },
  caraibes: { name: 'Caraïbes', sub: 'Trinité', insts: ['congas', 'bass', 'steelpan'], scale: 'majeur', key: 0, bpm: [90, 128], prog: [0, 3, 4, 0], ink: [1, 0.93, 0.3] },
};
export const INSTRUMENTS = Object.fromEntries(Object.entries(INST).map(([k, v]) => [k, v.label]));

// ---------- Séquenceur (pas de double croche) ----------
function scheduleStep(s, t) {
  const d = state.drama, s16 = s % 16, sd = 60 / bpm / 4;
  const { iv, n, prog, base } = scaleInfo();
  const climax = d.phase === 'climax', release = d.phase === 'release', tier = d.tier;
  let changed = false;

  if (s16 === 0) {
    bar++;
    const every = climax ? 1 : tier >= 1 ? 2 : 4;
    if (bar % every === 0 && bar > 0) { chordIdx = (chordIdx + 1) % prog.length; changed = true; }
  }
  const sig = settings.scale + settings.key;
  if (sig !== lastSig) { lastSig = sig; chordIdx %= prog.length; changed = true; }
  if (changed) setChord(t);
  if (s16 % 4 === 0) queue.push({ t, beat: 1 });
  const r = prog[chordIdx];

  // Battement de cœur : toujours là, même dans le calme.
  if (state.m.energy > 0.03 && !d.attract && !d.hush && (s16 === 0 || (s16 === 3 && !chan.some((c) => c.on)))) drum(t, mtof(base), s16 ? 0.25 : 0.4, bus.pad, 0.2);

  if (d.hush || state.session.ended > 0) return;      // silence collectif, ou fin de session : seule la nappe reste

  if (d.attract) return;     // personne ne bouge : aucun son

  const uni = climax ? UNISON.indexOf(s16) : -1;
  const S = settings.sectors;
  for (let i = 0; i < S.length; i++) {
    const c = chan[i], def = INST[c.inst];
    if (!c.on || !def) continue;
    const q = state.sec[i], coh = q.coherence;
    const e = climax ? Math.max(q.energy, 0.7) : q.energy;
    // Vitesse du secteur -> noires, croches ou doubles croches.
    const lvl = release ? 0 : climax ? 2 : q.speed < 0.3 ? 0 : q.speed < 0.6 ? 1 : 2;
    const grid = lvl === 0 ? s16 % 4 === 0 : lvl === 1 ? s16 % 2 === 0 : true;
    // Énergie -> nombre de notes ; cohérence -> régularité.
    const hit = climax ? uni >= 0
      : grid && (s16 % 8 === 0 || Math.random() < 0.4 + 0.6 * e) && (s16 % 4 === 0 || Math.random() < 0.55 + 0.45 * coh);
    const x = {
      t: climax ? t : t + Math.random() * (1 - coh) * 0.03, s16, sd, e, lvl, coh, r, n, iv, base, climax, uni, hit,
      oct: clamp(Math.round((0.5 - q.cy) * 2.4), -1, 1),      // mouvement en haut du secteur -> aigu
      d: c.in, c,
    };
    let played;
    if (c.accent) {
      c.accent = false; def.accent(x); played = true;
      queue.push({ t, accent: 1, x: (S[i].x + S[i].w / 2) / GW, y: (S[i].y + S[i].h / 2) / GH });
    } else played = def.play(x);
    if (played) queue.push({ t, sec: i });
  }
}

function tick() {
  if (!ac) return;
  if (nextT < ac.currentTime - 0.05) nextT = ac.currentTime + 0.05;   // onglet resté en arrière-plan
  while (nextT < ac.currentTime + 0.15) {
    scheduleStep(step, nextT);
    nextT += 60 / bpm / 4;
    step++;
  }
}

export const debugInfo = () => ({ ctx: ac?.state, time: ac?.currentTime, step, bar, on: chan.map((c) => c.on), queued: queue.length });

// Changement d'instrument à chaud : les notes déjà lancées s'éteignent d'elles-mêmes, la voix tenue du violon
// est fondue, les départs d'effets glissent vers ceux du nouvel instrument. Aucune coupure.
function swapInst(c, s, now) {
  if (c.inst === s.inst) return;
  if (c.viol) {            // la voix tenue (violon, flûte) est fondue puis libérée
    const v = c.viol; c.viol = null;
    v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.08);
    v.nodes.forEach((n) => { try { n.stop(now + 1); } catch { /* déjà arrêté */ } });
  }
  c.inst = INST[s.inst] ? s.inst : 'piano'; c.pos = 0; c.accent = false;
}

// ---------- Mise à jour à chaque image : mapping foule -> musique ----------
export function update(dt) {
  if (!ac) return;
  const now = ac.currentTime, m = state.m, d = state.drama, mu = state.music;
  const climax = d.phase === 'climax', release = d.phase === 'release';

  // Tempo : vitesse de la foule, ou sa pulsation quand elle est nette. Variation progressive.
  const [lo, hi] = PRESETS[settings.preset]?.bpm || [70, 140];
  let target = lo + (hi - lo) * m.speed;
  if (m.pulseConf > 0.5 && m.energy > 0.12 && m.pulseBpm) target = m.pulseBpm;
  if (climax) target = Math.max(target, lo + 0.8 * (hi - lo));
  if (m.still) target = lo;
  bpm += clamp(clamp(target, lo, hi) - bpm, -4 * dt, 4 * dt);
  dly.delayTime.setTargetAtTime(60 / bpm * 0.75, now, 0.3);

  // Secteurs : chacun ouvre son instrument selon sa propre énergie (seuil avec hystérésis).
  const ended = state.session.ended > 0, quiet = d.attract || m.still || d.hush || ended, S = settings.sectors;
  for (let i = 0; i < MAX_SECTORS; i++) {
    const c = chan[i], s = S[i], q = state.sec[i];
    if (!s) { c.on = q.on = false; c.level.gain.setTargetAtTime(0, now, 0.2); continue; }
    const def = INST[s.inst] || INST.piano;
    swapInst(c, s, now);
    const e = q.energy;
    c.on = q.on = !s.mute && s.present !== false && !quiet && (climax || (c.on ? e > 0.07 : e > 0.12));
    const amt = climax ? Math.max(e, 0.7) : release ? e * 0.6 : e;
    c.level.gain.setTargetAtTime(c.on ? def.level * s.vol * (0.4 + 0.6 * amt) : 0, now, 0.25);
    c.pan.pan.setTargetAtTime(clamp(((s.x + s.w / 2) / GW - 0.5) * 1.7, -0.9, 0.9), now, 0.1);
    const op = q.open;       // bras ouverts : timbre plus clair, plus d'écho et d'espace
    c.filt.frequency.setTargetAtTime((def.perc ? 4200 : 1000) * 2 ** (op * (def.perc ? 2 : 4)), now, 0.12);      // les percussions gardent toujours leur attaque
    c.rv.gain.setTargetAtTime(def.rev * (0.6 + 0.9 * op), now, 0.2); c.dl.gain.setTargetAtTime(def.dly * (0.4 + 1.4 * op) + 0.22 * Math.max(0, op - 0.6), now, 0.2);
    if (q.peakCount !== lastPeak[i]) { lastPeak[i] = q.peakCount; if (c.on) c.accent = true; }
  }

  pad.filter.frequency.setTargetAtTime(280 + 2200 * m.energy ** 1.5 + 300 * d.tier + 2600 * d.lift, now, 0.25);
  const det = 5 + 22 * (1 - m.coherence);
  pad.voices.forEach((o) => { o[0].detune.setTargetAtTime(-det, now, 0.5); o[1].detune.setTargetAtTime(det, now, 0.5); });
  pad.lfoGain.gain.setTargetAtTime(quiet ? 0.16 : 0.04, now, 1);          // la nappe respire au calme
  // Immobilité parfaite = silence complet : la nappe ne sonne que si quelqu'un bouge (ou tient les mains levées).
  const moving = Math.max(clamp((m.energy - 0.02) * 20), d.lift);
  pad.level.gain.setTargetAtTime(d.hush ? 0 : (quiet ? 0.3 : 0.1 + 0.25 * d.lift) * moving, now, d.hush ? 0.15 : moving < 0.05 ? 0.35 : 1.5);
  master.gain.setTargetAtTime(settings.volume * 0.4, now, 0.15);      // marge : le limiteur reste une sécurité

  if (d.tierUps !== lastTierUps) {           // palier franchi : montée puis impact
    lastTierUps = d.tierUps;
    const dur = 60 / bpm * (climax ? 4 : 2);
    riser(now, dur); impact(now + dur, 0.9); queue.push({ t: now + dur, accent: 1, x: 0.5, y: 0.5 });
  }

  // Gestes collectifs. Mains en l'air ensemble : montée, puis grande frappe. Silence ensemble : la reprise claque.
  if (d.liftStarts !== lastLift) { lastLift = d.liftStarts; riser(now, 2.2); }
  if (d.drops !== lastDrop) {
    lastDrop = d.drops; impact(now, 1); crash(now, 0.4, bus.fx);
    chordIdx = (chordIdx + 1) % scaleInfo().prog.length; setChord(now + 0.02);
    queue.push({ t: now, accent: 1, x: 0.5, y: 0.5 });
  }
  if (d.hushEnds !== lastHush) { lastHush = d.hushEnds; impact(now, 0.75); queue.push({ t: now, accent: 1, x: 0.5, y: 0.5 }); }
  if (state.session.ends !== lastEnd) {        // fin de session : dernier accord qui s'éteint
    lastEnd = state.session.ends;
    const { iv, n, prog, base } = scaleInfo(), r0 = prog[0];
    impact(now, 1);
    choirChord(now + 0.05, [r0 - n, r0, r0 + 2, r0 + 4, r0 + n].map((dg) => mtof(deg2midi(dg, base + 24, iv))), 0.5, bus.fx, 4.5, 0.4);
    queue.push({ t: now, accent: 1, x: 0.5, y: 0.5 });
  }

  // Événements audio arrivés à échéance -> état lu par les visuels.
  for (let i = queue.length - 1; i >= 0; i--) {
    const ev = queue[i];
    if (ev.t > now) continue;
    queue.splice(i, 1);
    if (ev.beat) { mu.beatPulse = 1; mu.beatCount++; }
    if (ev.accent) { mu.accent = 1; mu.accentCount++; mu.accentX = ev.x; mu.accentY = ev.y; }
    if (ev.sec !== undefined) state.sec[ev.sec].pulse = 1;
    if (ev.chord !== undefined) mu.chord = ev.chord;
  }
  const k = Math.exp(-dt * 9);
  for (const q of state.sec) q.pulse *= k;
  mu.beatPulse *= Math.exp(-dt * 7);
  mu.accent *= Math.exp(-dt * 2.5);
  mu.bpm = bpm;
  analyser.getFloatTimeDomainData(meter);
  let s = 0;
  for (let i = 0; i < meter.length; i++) s += meter[i] * meter[i];
  mu.level = Math.sqrt(s / meter.length);
}

// Auto-test : rend quelques secondes hors temps réel avec l'état courant et mesure le signal.
// solo : numéro de secteur (0..5) ou 'pad' pour n'entendre que cette tranche ; accent : force un accent à 2 s ;
// swap : { at, sector, inst } change un instrument en cours de rendu.
// À lancer depuis la console (window.__foule.offline(8)), puis recharger la page.
export async function offlineTest(seconds = 8, solo = '', accent = false, swap = null) {
  const sr = 44100;
  ac = new OfflineAudioContext(2, sr * seconds, sr);
  build();
  update(0);
  if (solo !== '') {
    if (solo !== 'pad') bus.pad.disconnect();
    bus.fx.disconnect();
    chan.forEach((c, i) => { if (i !== solo) c.pan.disconnect(); });
  }
  nextT = 0.05; step = 0; bar = -1;
  const notes = new Array(MAX_SECTORS).fill(0), S = settings.sectors;
  while (nextT < seconds) {
    if (accent && step === Math.round(2 / (60 / bpm / 4))) chan.forEach((c) => { c.accent = c.on; });
    if (swap && nextT >= swap.at && S[swap.sector].inst !== swap.inst) {       // changement d'instrument en cours de jeu
      S[swap.sector].inst = swap.inst; swapInst(chan[swap.sector], S[swap.sector], nextT);
      chan[swap.sector].level.gain.setTargetAtTime(INST[swap.inst].level * S[swap.sector].vol, nextT, 0.25);
    }
    const q0 = queue.length;
    scheduleStep(step, nextT);
    for (let i = q0; i < queue.length; i++) if (queue[i].sec !== undefined) notes[queue[i].sec]++;
    nextT += 60 / bpm / 4; step++;
  }
  queue.length = 0;
  const buf = await ac.startRendering(), l = buf.getChannelData(0), rr = buf.getChannelData(1);
  let sum = 0, peak = 0, sl = 0, srr = 0, click = 0;
  for (let i = sr; i < l.length; i++) {
    const v = (l[i] + rr[i]) * 0.5;
    sum += v * v; sl += l[i] * l[i]; srr += rr[i] * rr[i];
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(rr[i]));
    click = Math.max(click, Math.abs(l[i] - l[i - 1]));         // plus grand saut entre deux échantillons
  }
  const nn = l.length - sr, r4 = (v) => +v.toFixed(4);
  return { rms: r4(Math.sqrt(sum / nn)), peak: r4(peak), left: r4(Math.sqrt(sl / nn)), right: r4(Math.sqrt(srr / nn)),
    click: r4(click), bpm: r4(bpm), notes, on: chan.map((c) => +c.on) };
}
