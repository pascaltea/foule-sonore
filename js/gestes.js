// Reconnaissance de gestes pour jouer comme d'un instrument : à partir des 33 points du corps (MediaPipe Pose),
// une image après l'autre. Aucune dépendance : le même module sert à l'atelier et aux essais automatiques.
// Unité de mesure : la longueur du torse, pour que les gestes comptent pareil de près comme de loin.
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const GESTES = {
  monter: 'Monter un bras', descendre: 'Descendre un bras', balayer: 'Balayer de côté', frapper: 'Frapper',
  ouvrir: 'Ouvrir les bras', refermer: 'Refermer les mains', lever: 'Lever les deux mains', sauter: 'Sauter', pousser: 'Pousser vers l\'avant',
};
const SH = [11, 12], WR = [15, 16], HIP = [23, 24], NJ = 33;

export class Gestes {
  // mirror : l'image est déjà en miroir (scène) ; le sens du balayage suit alors l'écran.
  constructor(aspect = 16 / 9, mirror = false) {
    this.A = aspect; this.M = mirror ? -1 : 1; this.fresh = true; this.torso = 0.15;
    this.p = Array.from({ length: NJ }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vis: 0 }));
    this.hand = [0, 1].map(() => ({ peak: 0, arm: false, cool: 0, gap: 0 }));
    this.D = 1; this.dD = 0; this.canOpen = true; this.canClose = false; this.canUp = true; this.canPush = true;
    this.pz = 0; this.dpz = 0; this.jumpAge = 9; this.block = 0; this.quiet = 0;
    this.cont = { h: [0, 0], speed: [0, 0], open: 0, still: true, push: 0, seen: false };
  }

  // lm : 33 points {x, y, z, visibility} en coordonnées d'image (0 à 1). Renvoie les gestes reconnus sur cette image.
  step(lm, dt) {
    const ev = [], c = this.cont, A = this.A;
    if (!lm || lm.length < NJ || dt <= 0) { c.seen = false; c.still = true; this.fresh = true; return ev; }
    dt = Math.min(dt, 0.1);
    for (let k = 0; k < NJ; k++) {
      const q = this.p[k], m = lm[k];
      if (this.fresh) { q.x = m.x; q.y = m.y; q.z = m.z || 0; q.vx = q.vy = 0; }
      else {
        const nx = q.x + (m.x - q.x) * 0.7, ny = q.y + (m.y - q.y) * 0.7;
        q.vx += ((nx - q.x) / dt - q.vx) * 0.6; q.vy += ((ny - q.y) / dt - q.vy) * 0.6;
        q.x = nx; q.y = ny; q.z += ((m.z || 0) - q.z) * 0.5;
      }
      q.vis = m.visibility ?? 1;
    }
    const P = this.p, mid = (a, k) => (P[a[0]][k] + P[a[1]][k]) / 2;
    const shx = mid(SH, 'x'), shy = mid(SH, 'y'), hx = mid(HIP, 'x'), hy = mid(HIP, 'y');
    const tor = Math.max(0.04, Math.hypot((shx - hx) * A, shy - hy));
    this.torso = this.fresh ? tor : this.torso + (tor - this.torso) * 0.2;
    const T = this.torso, wasFresh = this.fresh;
    this.fresh = false; c.seen = true;
    this.block = Math.max(0, this.block - dt); this.jumpAge += dt;

    const vis = (k) => P[k].vis >= 0.4, both = vis(15) && vis(16);
    const sp = (k) => Math.hypot(P[k].vx * A, P[k].vy) / T;
    for (let i = 0; i < 2; i++) { c.h[i] = clamp((hy - P[WR[i]].y) / (2.6 * T)); c.speed[i] = vis(WR[i]) ? sp(WR[i]) : 0; }

    // Immobilité : plus rien ne bouge depuis un instant.
    const move = Math.max(c.speed[0], c.speed[1], sp(13), sp(14), Math.hypot(mid(HIP, 'vx') * A, mid(HIP, 'vy')) / T);
    this.quiet = move < 0.6 ? this.quiet + dt : 0;
    c.still = this.quiet > 0.35;
    if (wasFresh) return ev;

    // Les deux mains ensemble : écart et vitesse d'écartement.
    if (both) {
      const D = Math.hypot((P[15].x - P[16].x) * A, P[15].y - P[16].y) / T;
      this.dD += ((D - this.D) / dt - this.dD) * 0.5; this.D = D;
      c.open = clamp((D - 1) / 2);
      if (D < 1.9) this.canOpen = true;
      if (D > 1.1) this.canClose = true;
      if (this.canOpen && D > 2.4 && this.dD > 2.5) { this.canOpen = false; this.block = 0.3; ev.push({ type: 'ouvrir', v: clamp(this.dD / 9, 0.3, 1), h: (c.h[0] + c.h[1]) / 2 }); }
      if (this.canClose && D < 0.55 && this.dD < -2) { this.canClose = false; this.block = 0.3; ev.push({ type: 'refermer', v: clamp(-this.dD / 9, 0.3, 1), h: (c.h[0] + c.h[1]) / 2 }); }

      // Lever les deux mains au-dessus de la tête.
      const top = P[0].y - 0.25 * T, upv = -(P[15].vy + P[16].vy) / 2 / T;
      if (P[15].y > shy || P[16].y > shy) this.canUp = true;
      if (this.canUp && P[15].y < top && P[16].y < top && upv > 0.8) { this.canUp = false; this.block = 0.35; ev.push({ type: 'lever', v: clamp(upv / 6, 0.4, 1), h: 1 }); }

      // Pousser vers l'avant : les mains viennent vers la caméra. La profondeur est estimée, donc moins sûre que le reste.
      const pz = ((P[15].z + P[16].z) / 2 - (P[11].z + P[12].z) / 2) * A / T;
      this.dpz += ((pz - this.pz) / dt - this.dpz) * 0.5; this.pz = pz; c.push = pz;
      const chest = (k) => P[k].y > shy - 0.5 * T && P[k].y < hy;
      if (pz > -0.9) this.canPush = true;
      if (this.canPush && pz < -1.5 && this.dpz < -2.5 && chest(15) && chest(16) && this.D < 2) { this.canPush = false; this.block = 0.3; ev.push({ type: 'pousser', v: clamp(-this.dpz / 9, 0.4, 1), h: (c.h[0] + c.h[1]) / 2 }); }
    }

    // Chaque main : frappe (vers le bas, sèche) ou balayage (de côté).
    for (let i = 0; i < 2; i++) {
      const k = WR[i], H = this.hand[i];
      H.cool = Math.max(0, H.cool - dt);
      if (!vis(k)) { H.arm = false; H.row = undefined; continue; }
      const vx = P[k].vx * A / T, vy = P[k].vy / T, other = c.speed[1 - i];
      // Frappe : la main descend vite puis s'arrête net. Le son part à l'arrêt, comme une baguette sur une peau.
      if (!this.block && vy > 3 && vy > Math.abs(vx) * 0.8) { H.arm = true; H.peak = Math.max(H.peak, vy); }
      else if (H.arm && vy < H.peak * 0.45) {
        if (!this.block && !H.cool) ev.push({ type: 'frapper', hand: i, v: clamp(0.25 + (H.peak - 3) / 10), h: c.h[i], x: P[k].x });
        H.arm = false; H.peak = 0; H.cool = 0.11;
      }
      // Le mouvement lui-même joue : chaque fois que la main franchit un cran, vers le haut, vers le bas ou de côté,
      // un son part. Le sens du mouvement, la main (gauche ou droite) et le fait de bouger les deux bras comptent.
      const row = Math.floor(c.h[i] * 12), col = Math.floor(P[k].x * A / T / 0.42), spd = c.speed[i];
      H.gap = Math.max(0, (H.gap || 0) - dt);
      if (H.row === undefined) { H.row = row; H.col = col; }
      if (spd > 0.7 && !this.block && !H.gap) {
        const two = other > 1.2, v = clamp(0.2 + spd / 11, 0.2, 0.85);
        if (row !== H.row && Math.abs(vy) >= Math.abs(vx) * 0.7) { ev.push({ type: row > H.row ? 'monter' : 'descendre', hand: i, two, v, h: c.h[i] }); H.gap = 0.085; }
        else if (col !== H.col && Math.abs(vx) > Math.abs(vy) * 0.7) { ev.push({ type: 'balayer', hand: i, two, dir: (vx < 0 ? 1 : -1) * this.M, v, h: c.h[i] }); H.gap = 0.085; }
      }
      if (!H.gap || spd <= 0.7) { H.row = row; H.col = col; }
    }

    // Sauter : les hanches montent d'un coup.
    if (vis(23) && vis(24) && mid(HIP, 'vy') / T < -1.8 && this.jumpAge > 0.8) { this.jumpAge = 0; ev.push({ type: 'sauter', v: 1, h: (c.h[0] + c.h[1]) / 2 }); }
    return ev;
  }
}
