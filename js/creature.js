// La créature sur scène : une évocation de l'univers des affiches de l'Assemblée créative de Genève, jamais une
// reproduction. Pendant la session elle incarne la jauge collective (elle se lève à mesure qu'on joue ensemble) et
// prend peu à peu la forme de la façon de jouer du trio. À la fin elle se fige, entourée de son aura ; portrait()
// en tire l'image fixe de la galerie. Le dessin lui-même est dans creature-draw.js.
import { state, settings, actColors, clamp, smooth } from './state.js';
import { PLAIN, canvas, paintSkin, drawCreature, Gaze } from './creature-draw.js';

let cv, g, W = 0, H = 0;
let rise = 0, glow = 0, eyes = 0, aura = 0, blinkIn = 4, blink = 0, hop = 0, lastAccent = 0;
const cur = { ...PLAIN };          // forme affichée, qui glisse vers celle du trio
const gaze = new Gaze(3);
let life = 0;

export function init(el) { cv = el; g = cv.getContext('2d'); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
}
const bandsNow = () => (state.journey.bands.length ? state.journey.bands : [{ color: actColors().ink, w: 1 }]);
const colorsNow = () => bandsNow().map((b) => b.color).filter((c, i, a) => a.indexOf(c) === i).slice(-4);

// Image fixe de la créature d'une session : entièrement levée, sur fond noir pur.
export function portrait(w, h) {
  const c = canvas(w, h), x = c.getContext('2d'), f = { ...PLAIN, ...(state.journey.form || {}) }, R = h * 0.6;
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  paintSkin(bandsNow(), f, 0);
  drawCreature(x, w, h, w / 2, h + R * f.sy * 0.08, R, { ink: actColors().ink, glow: 1, beat: 0, eyes: 1, halo: false, flood: 0, t: 0 }, f);
  return c;
}

export function render(dt, t) {
  if (!g) return;
  resize();
  g.clearRect(0, 0, W, H);
  if (!settings.creature) return;
  const idle = !state.music.running;           // écran d'accueil : le dôme attend, à demi levé
  const d = state.drama, m = state.m, mu = state.music, J = state.journey;
  const ended = state.session.ended > 0;       // fin de session : la créature du trio, entière, dans son aura
  const climax = d.phase === 'climax', sleeping = d.attract && !ended, { ink } = actColors();

  // La forme glisse vers celle du trio : presque rien au début, de plus en plus à mesure que la session avance.
  const target = J.form && !idle && !sleeping ? J.form : PLAIN, tau = ended ? 0.7 : 2.5;
  const trust = ended ? 1 : J.form ? clamp(state.session.t / 150) * 0.85 : 1;
  for (const k in PLAIN) cur[k] = smooth(cur[k], PLAIN[k] + (target[k] - PLAIN[k]) * (k === 'veins' || k === 'over' ? 1 : trust), dt, k === 'veins' ? 0.4 : tau);

  rise = smooth(rise, ended ? 1 : idle ? 0.3 + 0.02 * Math.sin(t * 0.7) : sleeping ? 0 : d.gauge, dt, ended ? 0.5 : 0.9, 1.6);
  glow = smooth(glow, ended ? 0.95 : idle ? 0.42 + 0.08 * Math.sin(t * 0.7) : d.hush ? 0.08 : sleeping ? 0.12 : d.lift > 0 ? 0.5 + 0.5 * d.lift :
    climax ? 1 : 0.2 + 0.6 * d.gauge + 0.2 * clamp(m.energy) + 0.5 * state.flood, dt, 0.6, 1.4);
  eyes = smooth(eyes, ended || climax ? 1 : clamp((d.gauge - 0.66) / 0.3), dt, 0.5, 1.2);
  aura = smooth(aura, ended ? 1.5 : idle || sleeping ? 0.25 : 0.3 + 0.5 * d.gauge, dt, 1.2);
  life = smooth(life, ended ? 1 : 0, dt, 0.8);         // à la fin elle bouge un peu et écarquille les yeux
  gaze.step(dt);
  if (mu.accentCount !== lastAccent) { lastAccent = mu.accentCount; hop = 1; }
  hop *= Math.exp(-dt * 3.5);
  blinkIn -= dt;
  if (blinkIn < 0) { blink = 1; blinkIn = 3 + Math.random() * 5; }
  blink = Math.max(0, blink - dt * 6);

  const beat = ended ? 0 : mu.beatPulse * (d.tier > 0 ? 1 : 0.4);
  const R = Math.min(W * 0.27, H * 0.56) * (ended ? 0.82 : 1);
  const up = R * cur.sy * (0.1 + 0.82 * rise + (sleeping ? 0.012 * Math.sin(t * 0.9) : 0) + 0.02 * beat * rise + 0.03 * hop + (ended ? 0.012 * Math.sin(t * 0.9) : 0));
  paintSkin(bandsNow(), cur, ended ? 0 : t);
  drawCreature(g, W, H, W / 2, H + R * cur.sy - up, R,
    { ink, glow: clamp(glow), beat, eyes: up > R * 0.3 ? eyes * (1 - (ended ? gaze.blink : blink)) : 0, flood: ended ? 0 : state.flood, t, aura: colorsNow(), auraStrength: aura,
      life, wide: gaze.wide * life, look: gaze.look * life }, cur);
}
