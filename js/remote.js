// Régie à distance : une autre fenêtre du même navigateur (regie.html, par exemple sur l'écran de l'ordinateur
// pendant que la scène est projetée) pilote la scène en direct. Aucun serveur : les deux fenêtres se parlent
// par BroadcastChannel.
import { remoteHello, remoteState, remoteApply } from './ui.js';

export function init() {
  if (!('BroadcastChannel' in window)) return;
  const ch = new BroadcastChannel('foule-sonore');
  const send = (type, data) => ch.postMessage({ from: 'stage', type, data });
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from !== 'regie') return;
    if (m.type === 'hello') { send('hello', remoteHello()); send('state', remoteState()); return; }
    try { remoteApply(m); } catch { /* message ignoré */ }
    send('state', remoteState());
  };
  send('hello', remoteHello());
  setInterval(() => send('state', remoteState()), 300);
}
