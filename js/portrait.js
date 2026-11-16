// Ce qu'une session dit de ceux qui l'ont jouée : forme de la créature, surnom, portrait, et le code compact qui
// permet de la retrouver par un simple lien. Ce fichier ne dépend de rien : il sert à la scène comme aux pages
// publiques (creature.html, galerie.html).

// Les pays et leurs encres (mêmes valeurs que PRESETS dans music.js). La lettre sert au code des liens.
export const COUNTRIES = {
  g: { id: 'geneve', name: 'Genève', ink: [0.03, 0.6, 0.36] }, m: { id: 'mali', name: 'Mali', ink: [1, 0.46, 0.04] },
  i: { id: 'inde', name: 'Inde', ink: [0.95, 0.36, 0.9] }, j: { id: 'japon', name: 'Japon', ink: [0.8, 0.85, 0.96] },
  l: { id: 'levant', name: 'Levant', ink: [0.04, 0.5, 0.86] }, c: { id: 'caraibes', name: 'Caraïbes', ink: [1, 0.93, 0.3] },
};
const LETTER = Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [v.id, k]));
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// La forme. Tenir ensemble (r) : strates droites, contour net. Se faire de la place (c) : une seule masse, lueurs
// proches. Aller vers l'autre (o) : largeur, grain qui sort du contour. Sauts : cornes. Débordements : veines.
export function formOf(t) {
  const hn = Math.min(3, Math.floor(t.jumps / 3));
  return {
    amp: 3 + 42 * (1 - t.r), freq: 1.4 + 5 * t.e, dens: 0.5 + 0.5 * t.e, split: (1 - t.r) ** 1.6 * (1 - t.c * 0.5), gap: t.hushes >= 2 ? 2 : 0, rig: t.r,
    sx: 0.74 + 0.7 * t.o, sy: 1.2 - 0.46 * t.o, crest: 0.13 * (1 - t.c) * (0.4 + 0.6 * t.e) + 0.03 * (1 - t.r), sharp: 0.4 + 1.2 * t.r, k: 6 + 10 * t.e,
    lobes: 0.3 * (1 - t.c) ** 1.5, horns: hn, eGap: 0.13 + 0.34 * (1 - t.c), eSize: 0.65 + 1.1 * t.o, eOpen: 0.3 + 0.7 * t.e, eAsym: 0.3 * (1 - t.r) * (t.e > 0.5 ? 1 : 0),
    veins: Math.min(6, t.overflows), over: t.o * Math.min(1, t.overflows / 3 + 0.15),
    // Le tempérament de l'aura : elle bat (tenir ensemble), elle enveloppe (se faire de la place), elle s'ouvre (aller vers l'autre),
    // elle retient son souffle (silences), elle déborde (ondes), elle étincelle (sauts), ses courants se croisent (échanges).
    aPulse: t.r, aWrap: t.c, aReach: t.o, aSpeed: 0.55 + 0.9 * t.e, aHush: Math.min(3, t.hushes), aWaves: Math.min(6, t.overflows),
    aSpark: Math.min(1, t.jumps / 8), aCross: Math.min(1, t.swaps / 6),
  };
}

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
};
export function describe(t, group = true) {
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
  return { nick, text: out.join(' ') };
}
export const whoOf = (n, group = true) => (!group ? 'd\'une foule' : n <= 1 ? 'd\'une personne seule' : `de ${['deux', 'trois', 'quatre', 'cinq'][Math.min(n, 5) - 2]} inconnus`);

// Le code d'une créature : tout ce qu'il faut pour la redessiner et réécrire son portrait, en quelques dizaines de
// caractères. C'est lui que porte le lien (et le code QR) : aucune donnée n'est stockée ailleurs.
const P = (v) => Math.round(clamp(v) * 99);
export function encode(n, at, group, t, bands) {
  const b = bands.map((x) => (LETTER[x.id] || 'g') + Math.round(clamp(x.w / 3) * 99)).join('');
  return [1, n, at.replace(/\D/g, ''), group ? 'g' : 'c', P(t.r), P(t.c), P(t.o), P(t.e), t.n, t.startN, t.hushes, t.swaps, t.jumps, t.overflows, P(t.early), P(t.late), (t.leader ? 1 : 0) + (t.allPlaces ? 2 : 0), b].join('.');
}
export function decode(code) {
  const f = String(code || '').split('.');
  if (f.length < 18 || f[0] !== '1') return null;
  const num = (i) => +f[i] || 0, hm = f[2].padStart(4, '0'), group = f[3] !== 'c';
  const t = { r: num(4) / 99, c: num(5) / 99, o: num(6) / 99, e: num(7) / 99, n: num(8), startN: num(9), hushes: num(10), swaps: num(11), jumps: num(12), overflows: num(13),
    early: num(14) / 99, late: num(15) / 99, leader: num(16) & 1, allPlaces: !!(num(16) & 2) };
  const bands = [...f[17].matchAll(/([a-z])(\d+)/g)].map((m) => ({ id: COUNTRIES[m[1]]?.id || 'geneve', color: (COUNTRIES[m[1]] || COUNTRIES.g).ink, w: Math.max(0.02, +m[2] / 99 * 3) }));
  if (!bands.length) bands.push({ id: 'geneve', color: COUNTRIES.g.ink, w: 1 });
  const d = describe(t, group);
  return { n: num(1), at: `${+hm.slice(0, -2)} h ${hm.slice(-2)}`, who: whoOf(t.n, group), traits: t, form: formOf(t), bands, nick: d.nick, text: d.text, code,
    stops: bands.map((x) => Object.values(COUNTRIES).find((c) => c.id === x.id).name).filter((s, i, a) => s !== a[i - 1]) };
}
