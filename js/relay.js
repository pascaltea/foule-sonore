// Relais par Internet entre la scène et une régie sur un autre appareil (téléphone).
// Pas de serveur à nous : les deux côtés s'abonnent au même canal, nommé par un code secret, sur des relais de
// messagerie publics (MQTT par WebSocket). Deux relais sont utilisés en parallèle : si l'un tombe, l'autre suffit.
// Seuls des ordres de régie et l'état de la scène y passent, jamais d'image ni de son.
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
// ?broker=ws://… dans l'adresse remplace les relais (tests, ou relais privé).
export const brokersFromUrl = () => { const b = new URLSearchParams(location.search).get('broker'); return b ? [b] : BROKERS; };

export async function openRelay(room, side, onMsg, onStatus, brokers = BROKERS) {
  const mqtt = (await import('../vendor/mqtt.esm.js')).default;
  const base = `foule-sonore/v1/${room}/`, rx = base + (side === 'stage' ? 'up' : 'down'), tx = base + (side === 'stage' ? 'down' : 'up');
  const seen = [];
  let n = 0;
  const status = () => onStatus(clients.filter((c) => c.connected).length, clients.length);
  const clients = brokers.map((url) => {
    const c = mqtt.connect(url, { clientId: `fs-${side}-${Math.random().toString(36).slice(2, 10)}`, keepalive: 30, reconnectPeriod: 2500, connectTimeout: 8000, clean: true });
    c.on('connect', () => { c.subscribe(rx); status(); });
    c.on('close', status);
    c.on('error', () => { /* le client réessaie tout seul */ });
    c.on('message', (topic, payload) => {
      let m;
      try { m = JSON.parse(payload.toString()); } catch { return; }
      if (!m || !m.id || seen.includes(m.id)) return;          // même message arrivé par les deux relais
      seen.push(m.id); if (seen.length > 80) seen.shift();
      onMsg(m);
    });
    return c;
  });
  return {
    send(m) { const s = JSON.stringify({ ...m, id: `${side[0]}${Date.now().toString(36)}-${n++}` }); clients.forEach((c) => { if (c.connected) c.publish(tx, s); }); },
    close() { clients.forEach((c) => c.end(true)); },
  };
}

// Galerie en ligne : chaque créature est un message « retenu » par les relais, sous un code de galerie. Toute page
// qui s'abonne à ce code reçoit aussitôt toutes les créatures déjà nées, puis les suivantes en direct.
// Les relais publics ne garantissent pas de garder ces messages pour toujours : après la soirée, la galerie
// définitive est le fichier galerie.json du site (voir galerie.html).
export async function openFeed(gcode, onCode, onStatus = () => {}, brokers = BROKERS) {
  const mqtt = (await import('../vendor/mqtt.esm.js')).default;
  const base = `foule-sonore/v1/galerie/${gcode}/`, seen = new Set();
  const status = () => onStatus(clients.filter((c) => c.connected).length, clients.length);
  const clients = brokers.map((url) => {
    const c = mqtt.connect(url, { clientId: `fs-gal-${Math.random().toString(36).slice(2, 10)}`, keepalive: 30, reconnectPeriod: 2500, connectTimeout: 8000, clean: true });
    c.on('connect', () => { c.subscribe(base + '+'); status(); });
    c.on('close', status);
    c.on('error', () => { /* le client réessaie tout seul */ });
    c.on('message', (topic, payload) => { const code = payload.toString(); if (code && !seen.has(code)) { seen.add(code); onCode(code); } });
    return c;
  });
  return {
    publish(n, code) { seen.add(code); clients.forEach((c) => { if (c.connected) c.publish(base + n, code, { retain: true, qos: 1 }); }); },
    close() { clients.forEach((c) => c.end(true)); },
  };
}
