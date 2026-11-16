// Le morceau de chaque session, gardé sur l'ordinateur de scène. On enregistre le son produit par l'ordinateur,
// jamais la salle : ni voix, ni image. Les morceaux restent dans le navigateur jusqu'à « Exporter les morceaux ».
import { tapStream } from './music.js';

const DB = 'creatura-morceaux', STORE = 'morceaux';
let rec = null, chunks = [], pending = null, timer = 0;

function open() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function put(n, blob) {
  try { const db = await open(); db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, n); } catch { /* stockage indisponible : le morceau est perdu, la soirée continue */ }
}
function stopNow() {
  clearTimeout(timer);
  if (!rec) return;
  const r = rec, c = chunks, n = pending;
  rec = null; pending = null;
  r.onstop = () => { if (n != null && c.length) put(n, new Blob(c, { type: r.mimeType })); };
  try { r.stop(); } catch { /* déjà arrêté */ }
}
// Début de session : on lance l'enregistrement (le précédent, s'il attendait sa fin, est rangé d'abord).
export function start() {
  stopNow();
  const s = tapStream();
  if (!s || !window.MediaRecorder) return;
  const type = ['audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  try {
    rec = new MediaRecorder(s, { mimeType: type, audioBitsPerSecond: 96000 }); chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start(2000);
  } catch { rec = null; }
}
// Fin de session : le morceau prend le numéro de la créature, après quelques secondes pour laisser sonner la fin.
export function end(n) { if (!rec) return; pending = n; clearTimeout(timer); timer = setTimeout(stopNow, 6000); }
// Session abandonnée (la scène s'est vidée) : rien n'est gardé.
export function cancel() { pending = null; stopNow(); }

export async function count() {
  try { const db = await open(); return await new Promise((ok) => { const r = db.transaction(STORE).objectStore(STORE).count(); r.onsuccess = () => ok(r.result); r.onerror = () => ok(0); }); } catch { return 0; }
}
// Télécharge tous les morceaux, un fichier par créature : creature-<numéro>.webm
export async function exportAll() {
  let list = [];
  try {
    const db = await open(), st = db.transaction(STORE).objectStore(STORE);
    list = await new Promise((ok) => { const out = [], r = st.openCursor(); r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue(); } else ok(out); }; r.onerror = () => ok(out); });
  } catch { return 0; }
  for (const [n, blob] of list) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `creature-${n}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`; a.click();
    await new Promise((r) => setTimeout(r, 400)); URL.revokeObjectURL(a.href);
  }
  return list.length;
}
export async function clear() { try { const db = await open(); db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* rien */ } }
