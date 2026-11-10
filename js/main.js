// Boucle principale : captation -> métriques -> dramaturgie -> musique -> visuels.
import { state, settings } from './state.js';
import * as capture from './capture.js';
import { updateMetrics, updateDrama } from './metrics.js';
import * as music from './music.js';
import * as visuals from './visuals.js';
import * as ui from './ui.js';

let last = performance.now(), lowT = 0, highT = 0, glOk = true;

try { visuals.init(document.getElementById('stage')); }
catch (e) { glOk = false; ui.note('WebGL indisponible : visuels désactivés, la musique fonctionne.', 0); }

async function useCamera() {
  try {
    await capture.startCamera(settings.cameraId);
    settings.simulate = false;
  } catch (e) {
    if (settings.cameraId) {              // caméra mémorisée absente : essayer celle par défaut
      settings.cameraId = '';
      try { await capture.startCamera(''); await ui.refreshCameras(); return; } catch { /* suite ci-dessous */ }
    }
    ui.setSim(true);
    ui.note(`${state.capture.error || 'Caméra indisponible'} : mode simulation activé (souris, touches 0 à 4, Espace).`, 9000);
  }
  await ui.refreshCameras();
}

ui.init({
  async onStart(withCamera) {
    try { await music.init(); } catch (e) { ui.note('Audio indisponible dans ce navigateur.', 8000); }
    if (withCamera) await useCamera(); else ui.setSim(true);
    ui.started();
  },
  onCamera: useCamera,
  onSim(v) { if (!v && state.capture.mode !== 'camera' && state.music.running) useCamera(); },
});
ui.refreshCameras();

function adaptQuality(rawDt) {
  const p = state.perf;
  if (rawDt > 0.25) return;               // onglet masqué : mesure non significative
  p.fps += (1 / rawDt - p.fps) * 0.05;
  if (p.fps < 45) { lowT += rawDt; highT = 0; } else if (p.fps > 56) { highT += rawDt; lowT = 0; } else { lowT = 0; highT = 0; }
  if (lowT > 2.5 && p.quality > 0) { p.quality--; lowT = 0; }
  if (highT > 25 && p.quality < 2) { p.quality++; highT = 0; }
}

function pipeline(dt, t) {
  capture.update(dt, t);
  updateMetrics(dt);
  updateDrama(dt);
  music.update(dt);
  if (glOk) visuals.render(dt, t);
  ui.update();
}

function frame(now) {
  const rawDt = Math.max(0.001, (now - last) / 1000), dt = Math.min(0.05, rawDt);
  last = now;
  pipeline(dt, now / 1000);
  adaptQuality(rawDt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès console pour le réglage sur site et les auto-tests.
let vt = 0;
window.__foule = {
  state, settings, audio: music.debugInfo, offline: music.offlineTest,
  run(seconds) { for (let i = 0; i < seconds * 60; i++) { vt += 1 / 60; pipeline(1 / 60, vt); } },   // avance en temps virtuel
};
