// Moteur visuel WebGL : particules poussées par le flux optique, traînées, ondes de choc.
// L'image de la caméra n'est jamais affichée.
import { GW, GH, GN, state, settings, clamp } from './state.js';

export const PALETTES = {
  braise: { label: 'Braise', c: [[1, 0.22, 0.04], [1, 0.62, 0.08], [1, 0.92, 0.55]] },
  aurore: { label: 'Aurore', c: [[0.05, 0.95, 0.7], [0.25, 0.45, 1], [0.95, 0.25, 0.85]] },
  ocean: { label: 'Océan', c: [[0, 0.3, 1], [0, 0.8, 0.9], [0.75, 1, 1]] },
  neon: { label: 'Néon', c: [[1, 0, 0.6], [0.2, 1, 0.3], [0.1, 0.6, 1]] },
};

const MAX = 36000;
const QUALITY = [{ n: 0.35, s: 0.6 }, { n: 0.6, s: 0.8 }, { n: 1, s: 1 }];
const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
const life = new Float32Array(MAX), sa = new Float32Array(MAX), sb = new Float32Array(MAX);
const data = new Float32Array(MAX * 4);
for (let i = 0; i < MAX; i++) {
  px[i] = Math.random(); py[i] = Math.random(); life[i] = Math.random() * 5;
  sa[i] = Math.random(); sb[i] = Math.random();
}

let gl, cv, pP, pF, pO, quadBuf, partBuf, fbo = [], tex = [], fw = 0, fh = 0, cur = 0;
let harm = 0, lastAccent = 0, lastBeat = 0;
const shocks = [], secU = new Float32Array(28);

const VS_Q = 'attribute vec2 a; varying vec2 v; void main(){ v=a*.5+.5; gl_Position=vec4(a,0.,1.); }';
const FS_FADE = `precision mediump float; uniform sampler2D t; uniform float fade, zoom; varying vec2 v;
void main(){ vec2 u=(v-.5)*(1.-zoom)+.5; gl_FragColor=vec4(max(texture2D(t,u).rgb*fade-vec3(.004),0.),1.); }`;
// a.w = (secteur + 1) + graine : la partie entière désigne le secteur (0 = hors secteur).
const VS_P = `attribute vec4 a; uniform float size, bright, harm; uniform vec3 c0, c1, c2; uniform vec4 sc[7]; varying vec3 col;
void main(){ float si=floor(a.w), sd=a.w-si, t=fract(sd+harm)*3.;
  vec3 c = t<1. ? mix(c0,c1,t) : t<2. ? mix(c1,c2,t-1.) : mix(c2,c0,t-2.);
  vec4 s = sc[int(si)];
  if (s.a > 0.) c = mix(c, s.rgb, .72)*(.8+1.3*(s.a-1.));   // teinte du secteur, qui pulse avec son instrument
  col = c*bright*(.16+1.3*a.z);
  gl_Position = vec4(a.x*2.-1., 1.-a.y*2., 0., 1.);
  gl_PointSize = size*(.7+a.z*1.3+fract(sd*7.)*.8); }`;
const FS_P = `precision mediump float; varying vec3 col;
void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(col*smoothstep(.5,.05,d),1.); }`;
const FS_POST = `precision mediump float; uniform sampler2D t; uniform vec2 px, cen; uniform float aspect, flash, energy;
uniform vec4 sh[4]; uniform vec3 c0, c2; varying vec2 v;
void main(){ vec2 u=v; float ring=0.;
  for(int i=0;i<4;i++){ vec2 d=(v-sh[i].xy)*vec2(aspect,1.); float L=length(d)+1e-4;
    float w=exp(-pow((L-sh[i].z)/.045,2.))*sh[i].w; u-=d/L/vec2(aspect,1.)*w*.03; ring+=w; }
  vec3 c=texture2D(t,u).rgb;
  vec3 b=texture2D(t,u+px*vec2(5.,0.)).rgb+texture2D(t,u-px*vec2(5.,0.)).rgb+texture2D(t,u+px*vec2(0.,5.)).rgb+texture2D(t,u-px*vec2(0.,5.)).rgb
        +texture2D(t,u+px*vec2(9.,9.)).rgb+texture2D(t,u-px*vec2(9.,9.)).rgb+texture2D(t,u+px*vec2(9.,-9.)).rgb+texture2D(t,u+px*vec2(-9.,9.)).rgb;
  c += b*.07 + ring*.55*mix(c0,c2,.5) + flash*.25*c2;
  float g=length((v-cen)*vec2(aspect,1.)); c += c0*.04*(.4+energy)*exp(-g*g*3.);
  float vg=length(v-.5); c *= 1.-.9*vg*vg;
  gl_FragColor = vec4(1.-exp(-c*1.5), 1.); }`;

function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace('[0]', '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export function init(canvas) {
  cv = canvas;
  gl = cv.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL indisponible');
  pP = program(VS_P, FS_P); pF = program(VS_Q, FS_FADE); pO = program(VS_Q, FS_POST);
  quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  partBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.disable(gl.DEPTH_TEST);
}

function resize() {
  const q = QUALITY[state.perf.quality], dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.round(cv.clientWidth * dpr * q.s)), h = Math.max(2, Math.round(cv.clientHeight * dpr * q.s));
  if (w === fw && h === fh) return;
  fw = w; fh = h; cv.width = w; cv.height = h;
  for (let i = 0; i < 2; i++) {
    if (tex[i]) { gl.deleteTexture(tex[i]); gl.deleteFramebuffer(fbo[i]); }
    tex[i] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo[i] = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[i], 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

function respawn(i, A) {
  let x = Math.random(), y = Math.random();
  for (let k = 0; k < 3; k++) {            // de préférence là où la foule bouge
    const c = (Math.random() * GN) | 0;
    if (A[c] > Math.random() * 0.7 + 0.05) {
      x = ((c % GW) + Math.random()) / GW; y = (((c / GW) | 0) + Math.random()) / GH; break;
    }
  }
  px[i] = x; py[i] = y; vx[i] = 0; vy[i] = 0; life[i] = 1.5 + Math.random() * 4;
}

function stepParticles(dt, t, count, attract) {
  const { x: FX, y: FY, act: A } = state.flow, m = state.m, d = state.drama, map = state.cellSector;
  const aspect = fw / fh, beat = state.music.beatPulse;
  const shape = attract ? 2 : d.phase === 'climax' ? 3 : d.tier;
  // Cohérence -> formes organisées ; dispersion -> turbulence.
  const org = attract ? 0.6 : m.coherence * m.coherence * (shape === 0 ? 0.5 : 1) * clamp(m.energy * 4);
  const turb = attract ? 0.03 : 0.02 + 0.32 * m.energy * (1 - m.coherence);
  const ccx = attract ? 0.5 : 0.5 + (m.cx - 0.5) * 0.7, ccy = attract ? 0.5 : 0.5 + (m.cy - 0.5) * 0.7;
  const damp = Math.exp(-dt * 1.8), k4 = org * 4 * dt;
  for (let i = 0; i < count; i++) {
    let x = px[i], y = py[i], ux = vx[i], uy = vy[i];
    const gi = Math.min(GH - 1, (y * GH) | 0) * GW + Math.min(GW - 1, (x * GW) | 0);
    const a = A[gi];
    if (a > 0.02) {
      const k = Math.min(1, dt * 10 * a);
      ux += (FX[gi] / GW * 1.6 - ux) * k; uy += (FY[gi] / GH * 1.6 - uy) * k;
    }
    if (org > 0.01) {
      const s = sa[i], b = sb[i];
      let hx = x, hy = y;
      if (shape <= 1) {                       // bandes ondulantes
        const band = (b * 7) | 0;
        hy = (band + 0.5) / 7 + (shape ? 0.05 : 0.02) * Math.sin(x * 10 + t * 1.2 + band);
      } else if (shape === 2) {               // anneaux concentriques autour de la foule
        const ring = (b * 6) | 0, r = (0.07 + 0.065 * ring) * (1 + 0.1 * beat);
        const an = s * 6.283 + t * 0.25 * (ring % 2 ? 1 : -1);
        hx = ccx + r * Math.cos(an) / aspect; hy = ccy + r * Math.sin(an);
      } else {                                // rosace du climax
        const an = s * 6.283 + t * 0.2;
        const r = (0.14 + 0.36 * b) * (0.6 + 0.4 * Math.cos(6 * an - t * 1.5)) * (1 + 0.12 * beat);
        hx = 0.5 + r * Math.cos(an) / aspect; hy = 0.5 + r * Math.sin(an);
      }
      ux += (hx - x) * k4; uy += (hy - y) * k4;
    }
    const ang = (Math.sin(x * 9 + t * 0.4 + sa[i] * 3) + Math.cos(y * 11 - t * 0.3)) * 3.14;
    ux += Math.cos(ang) * turb * dt; uy += Math.sin(ang) * turb * dt;
    ux *= damp; uy *= damp;
    x += ux * dt; y += uy * dt;
    life[i] -= dt;
    if (life[i] < 0 || x < 0 || x > 1 || y < 0 || y > 1) { respawn(i, A); x = px[i]; y = py[i]; ux = uy = 0; }
    px[i] = x; py[i] = y; vx[i] = ux; vy[i] = uy;
    const j = i * 4;
    data[j] = x; data[j + 1] = y; data[j + 2] = Math.min(1, Math.hypot(ux, uy) * 5 + a * 0.3); data[j + 3] = sa[i] * 0.999 + map[gi] + 1;
  }
}

function quad(prog) {
  gl.useProgram(prog.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

export function render(dt, t) {
  if (!gl) return;
  resize();
  const m = state.m, d = state.drama, mu = state.music;
  const attract = d.attract;
  const pal = (PALETTES[settings.palette] || PALETTES.braise).c;
  const q = QUALITY[state.perf.quality];
  const count = Math.floor(MAX * q.n * (attract ? 0.3 : 0.15 + 0.85 * m.energy));
  stepParticles(dt, t, count, attract);

  // La palette glisse avec l'harmonie ; les accents déclenchent flash et onde de choc.
  harm += (mu.chord * 0.17 + d.tier * 0.06 - harm) * Math.min(1, dt * 1.5);
  if (mu.accentCount !== lastAccent) {
    lastAccent = mu.accentCount;
    shocks.push({ x: mu.accentX, y: mu.accentY, age: 0, str: 1 });
  }
  if (mu.beatCount !== lastBeat) {
    lastBeat = mu.beatCount;
    if (d.tier >= 2 && mu.beatCount % 4 === 0) shocks.push({ x: m.cx, y: m.cy, age: 0, str: 0.35 });
  }
  for (let i = shocks.length - 1; i >= 0; i--) { shocks[i].age += dt; if (shocks[i].age > 1.6) shocks.splice(i, 1); }
  while (shocks.length > 4) shocks.shift();

  const src = cur, dst = 1 - cur; cur = dst;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
  gl.viewport(0, 0, fw, fh);
  gl.disable(gl.BLEND);
  quad(pF);
  gl.bindTexture(gl.TEXTURE_2D, tex[src]);
  // Vitesse -> longueur des traînées.
  gl.uniform1f(pF.u.fade, attract ? 0.95 : 0.9 + 0.085 * m.speed);
  gl.uniform1f(pF.u.zoom, d.tier >= 2 ? 0.002 + 0.006 * mu.beatPulse : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(pP.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * 4));
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  const pulse = d.tier > 0 || attract ? mu.beatPulse : mu.beatPulse * 0.4;
  gl.uniform1f(pP.u.size, fh / 1080 * 2.4 * (1 + 0.5 * pulse));
  gl.uniform1f(pP.u.bright, (attract ? 0.22 : (0.07 + 0.13 * m.energy) * (d.tier >= 2 ? 0.55 : 1)) * (1 + 0.5 * pulse) + 0.1 * mu.accent);
  gl.uniform1f(pP.u.harm, harm);
  secU.fill(0);
  settings.sectors.forEach((s, i) => {
    const h = parseInt(s.color.slice(1), 16), j = (i + 1) * 4;
    secU[j] = (h >> 16) / 255; secU[j + 1] = ((h >> 8) & 255) / 255; secU[j + 2] = (h & 255) / 255;
    secU[j + 3] = 1 + state.sec[i].pulse;
  });
  gl.uniform4fv(pP.u.sc, secU);
  gl.uniform3fv(pP.u.c0, pal[0]); gl.uniform3fv(pP.u.c1, pal[1]); gl.uniform3fv(pP.u.c2, pal[2]);
  gl.drawArrays(gl.POINTS, 0, count);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  quad(pO);
  gl.bindTexture(gl.TEXTURE_2D, tex[dst]);
  const sh = new Float32Array(16);
  shocks.forEach((s, i) => sh.set([s.x, 1 - s.y, s.age * 0.75, s.str * (1 - s.age / 1.6)], i * 4));
  gl.uniform4fv(pO.u.sh, sh);
  gl.uniform2f(pO.u.px, 1 / fw, 1 / fh);
  gl.uniform2f(pO.u.cen, m.cx, 1 - m.cy);
  gl.uniform1f(pO.u.aspect, fw / fh);
  gl.uniform1f(pO.u.flash, mu.accent);
  gl.uniform1f(pO.u.energy, m.energy);
  gl.uniform3fv(pO.u.c0, pal[0]); gl.uniform3fv(pO.u.c2, pal[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
