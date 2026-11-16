// Régie à distance. Deux chemins, mêmes messages :
// - une autre fenêtre du même navigateur (regie.html), par BroadcastChannel, sans réseau ;
// - un autre appareil (téléphone), par Internet, quand « Régie sur téléphone » est activée (voir relay.js).
import { settings, saveSettings } from './state.js';
import { remoteHello, remoteState, remoteApply } from './ui.js';
import { openRelay, openFeed, brokersFromUrl } from './relay.js';
import { gallery, onCreature } from './journey.js';

let relay = null, heard = 0, up = 0, total = 0, opening = false;

function handle(m, send) {
  if (!m || m.from !== 'regie') return;
  if (m.type === 'hello') { send('hello', remoteHello()); send('state', remoteState()); return; }
  if (m.type !== 'ping') { try { remoteApply(m); } catch { /* message ignoré */ } }
  send('state', remoteState());
}

export function init() {
  if ('BroadcastChannel' in window) {
    const ch = new BroadcastChannel('foule-sonore');
    const send = (type, data) => ch.postMessage({ from: 'stage', type, data });
    ch.onmessage = (e) => handle(e.data, send);
    send('hello', remoteHello());
    setInterval(() => send('state', remoteState()), 300);
  }
  // Par Internet : l'état n'est envoyé que si une régie écoute, une fois par seconde.
  setInterval(() => { if (relay && Date.now() - heard < 12000) relay.send({ from: 'stage', type: 'state', data: remoteState() }); }, 1000);
  if (settings.remoteOn) setNet(true);
  if (settings.onlineGallery) setGallery(true);
}

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export async function setNet(on, fresh = false) {
  settings.remoteOn = !!on;
  if (relay) { relay.close(); relay = null; }
  up = total = 0; heard = 0;
  if (on && (fresh || !settings.room)) settings.room = newCode();
  saveSettings();
  if (!on || opening) return;
  opening = true;
  try {
    const send = (type, data) => relay?.send({ from: 'stage', type, data });
    relay = await openRelay(settings.room, 'stage', (m) => { heard = Date.now(); handle(m, send); }, (c, t) => { up = c; total = t; }, brokersFromUrl());
  } catch { relay = null; }
  opening = false;
}

export const netInfo = () => ({ on: settings.remoteOn, ready: !!relay, up, total, phone: Date.now() - heard < 7000 });
export function regieUrl() {
  const u = new URL('regie.html', location.href), b = new URLSearchParams(location.search).get('broker');
  u.search = b ? '?broker=' + encodeURIComponent(b) : ''; u.hash = settings.room || '';
  return u.href;
}

// ---------- Galerie en ligne ----------
let feed = null, feedUp = 0;
export async function setGallery(on) {
  settings.onlineGallery = !!on;
  if (feed) { feed.close(); feed = null; feedUp = 0; }
  if (on && !settings.galleryCode) settings.galleryCode = newCode();
  saveSettings();
  if (!on) return;
  try {
    feed = await openFeed(settings.galleryCode, () => {}, (c) => {
      const first = !feedUp && c > 0; feedUp = c;
      if (first) gallery.items.forEach((it) => { if (it.code) feed.publish(it.n, it.code); });      // au branchement : tout ce qui existe déjà
    }, brokersFromUrl());
  } catch { feed = null; }
}
onCreature((item) => { if (feed && item.code) feed.publish(item.n, item.code); });
export const galleryInfo = () => ({ on: settings.onlineGallery, up: feedUp });
const page = (name, query, hash) => { const u = new URL(name, location.href), b = new URLSearchParams(location.search).get('broker'), q = new URLSearchParams(query); if (b) q.set('broker', b); u.search = q.toString() ? '?' + q : ''; u.hash = hash || ''; return u.href; };
export const galleryUrl = () => page('galerie.html', {}, settings.onlineGallery ? settings.galleryCode : '');
export const creatureUrl = (code) => page('creature.html', settings.onlineGallery && settings.galleryCode ? { g: settings.galleryCode } : {}, code);
