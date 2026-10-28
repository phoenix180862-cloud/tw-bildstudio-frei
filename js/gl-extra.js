// TW Bildstudio – Zusatz-Stufen auf der Grafikkarte (eigener WebGL2-Kontext)
import { tr, trz } from './i18n.js';
//   • Unschärfe-Rettung: Richardson-Lucy-Entfaltung (Fokus-Unschärfe = Gauß, Verwacklung = Bewegungslinie)
//   • Lokale Anpassungen: Verlaufsfilter, Radialfilter, Pinsel- und Himmelsmasken mit eigenen Reglern
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const KOPF = `#version 300 es
precision highp float;
out vec4 o;`;
// Faltung entlang einer Richtung (Gauß oder Bewegungslinie), Abtastung über alle Pixel der Spur
const FS_FALT = KOPF + `
uniform sampler2D uT; uniform vec2 uDir; uniform float uSigma; uniform float uLen; uniform int uArt; uniform vec2 uSize;
void main(){
  vec2 uv = gl_FragCoord.xy / uSize; vec3 s = vec3(0.); float w = 0.;
  if (uArt == 0) { int r = int(ceil(uSigma * 3.)); for (int i = -24; i <= 24; i++) { if (abs(i) > r) continue; float g = exp(-float(i*i) / (2. * uSigma * uSigma)); s += texture(uT, uv + uDir * float(i) / uSize).rgb * g; w += g; } }
  else { int r = int(ceil(uLen * .5)); for (int i = -40; i <= 40; i++) { if (abs(i) > r) continue; s += texture(uT, uv + uDir * float(i) / uSize).rgb; w += 1.; } }
  o = vec4(s / w, 1.);
}`;
const FS_DIV = KOPF + `uniform sampler2D uA; uniform sampler2D uB; uniform vec2 uSize;
void main(){ vec2 uv = gl_FragCoord.xy / uSize; vec3 a = texture(uA, uv).rgb, b = texture(uB, uv).rgb; o = vec4(clamp(a / max(b, vec3(1e-3)), vec3(.3), vec3(3.)), 1.); }`;
const FS_MUL = KOPF + `uniform sampler2D uA; uniform sampler2D uB; uniform vec2 uSize;
void main(){ vec2 uv = gl_FragCoord.xy / uSize; o = vec4(clamp(texture(uA, uv).rgb * texture(uB, uv).rgb, 0., 1.5), 1.); }`;
const FS_LIN = KOPF + `uniform sampler2D uA; uniform vec2 uSize; uniform float uDir;
void main(){ vec2 uv = gl_FragCoord.xy / uSize; vec4 c = texture(uA, uv); o = vec4(uDir > 0. ? pow(max(c.rgb, 0.), vec3(2.2)) : pow(max(c.rgb, 0.), vec3(1. / 2.2)), 1.); }`;
// Ausgabe: Ergebnis mit Original mischen, Säume (Ringing) begrenzen, oben/unten richtig herum
const FS_MIX = KOPF + `uniform sampler2D uOrig; uniform sampler2D uEst; uniform vec2 uSize; uniform float uMix; uniform float uFlip;
void main(){ vec2 uv = gl_FragCoord.xy / uSize; if (uFlip > .5) uv.y = 1. - uv.y; vec4 a = texture(uOrig, uv); vec3 e = texture(uEst, uv).rgb;
  vec3 mn = a.rgb, mx = a.rgb; for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 n = texture(uOrig, uv + vec2(i, j) * 2. / uSize).rgb; mn = min(mn, n); mx = max(mx, n); }
  e = clamp(e, mn - .06, mx + .06); o = vec4(mix(a.rgb, e, uMix), a.a); }`;
// Lokale Anpassungen: bis zu 8 Masken
const FS_LOKAL = KOPF + `
uniform sampler2D uImg; uniform sampler2D uPinsel0; uniform sampler2D uPinsel1; uniform vec2 uSize; uniform int uN;
uniform vec4 uGeo[8]; uniform vec4 uGeo2[8]; uniform int uTyp[8]; uniform float uInv[8];
uniform vec4 uA[8]; uniform vec4 uB[8]; uniform vec4 uC[8]; uniform float uZeig; uniform int uAktiv;
float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
float gewicht(int k, vec2 p){
  float w = 0.;
  int t = uTyp[k];
  if (t == 0) { vec2 a = uGeo[k].xy * uSize, b = uGeo[k].zw * uSize; vec2 d = b - a; float s = dot(p - a, d) / max(dot(d, d), 1.); w = 1. - smoothstep(0., 1., s); }
  else if (t == 1) { vec2 c = uGeo[k].xy * uSize; vec2 r = max(uGeo[k].zw * uSize, vec2(1.)); float an = uGeo2[k].x; vec2 q = p - c; q = vec2(cos(an) * q.x + sin(an) * q.y, -sin(an) * q.x + cos(an) * q.y) / r; float d = length(q); float f = clamp(uGeo2[k].y, .01, 1.); w = 1. - smoothstep(1. - f, 1., d); }
  else { int ch = int(uGeo[k].x); vec2 uv = p / uSize; vec4 m = ch < 4 ? texture(uPinsel0, uv) : texture(uPinsel1, uv); int c = ch - (ch < 4 ? 0 : 4); w = c == 0 ? m.r : c == 1 ? m.g : c == 2 ? m.b : m.a; }
  return uInv[k] > .5 ? 1. - w : w;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 tuv = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uSize;
  vec4 src = texture(uImg, tuv); vec3 c = src.rgb; vec2 px = 1. / uSize;
  vec3 nb = (texture(uImg, tuv + vec2(px.x, 0.)).rgb + texture(uImg, tuv - vec2(px.x, 0.)).rgb + texture(uImg, tuv + vec2(0., px.y)).rgb + texture(uImg, tuv - vec2(0., px.y)).rgb) * .25;
  vec3 bl = vec3(0.); for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) bl += texture(uImg, tuv + vec2(i, j) * px * 6.).rgb; bl /= 25.;
  float zeigW = 0.;
  for (int k = 0; k < 8; k++) {
    if (k >= uN) break;
    float w = gewicht(k, p); if (k == uAktiv) zeigW = w; if (w < .002) continue;
    vec4 A = uA[k], B = uB[k], C = uC[k]; // A: Belichtung, Kontrast, Lichter, Tiefen · B: Temperatur, Tönung, Sättigung, Klarheit · C: Schärfe, Dunst, Rauschen(-), –
    vec3 d = c;
    d *= exp2(A.x * 2.);
    vec3 wb = vec3(1. + B.x * .5, 1. - B.y * .3, 1. - B.x * .5); wb /= lum(wb); d *= wb;
    float L = lum(d); float Lb = lum(bl);
    d += A.z * .3 * smoothstep(.45, 1., L) + A.w * .34 * (1. - smoothstep(0., .55, L));
    d = (d - .47) * (1. + A.y * .7) + .47;
    L = lum(d); d += (L - Lb) * B.w * 1.4 * (1. - pow(abs(2. * clamp(L, 0., 1.) - 1.), 2.));
    if (C.y != 0.) { float h = C.y * .12; d = (d - h) / (1. - h); }
    d = mix(vec3(lum(d)), d, 1. + B.z);
    d += (lum(c) - lum(mix(nb, c, 0.))) * C.x * 2.4;
    if (C.z > 0.) d = mix(d, mix(d, nb, .7), C.z);
    c = mix(c, clamp(d, 0., 1.), w);
  }
  if (uZeig > .5) c = mix(c, vec3(1., .15, .15), zeigW * .55);
  o = vec4(clamp(c, 0., 1.), src.a);
}`;

class GX {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 4; this.cv.height = 4;
    const gl = this.gl = this.cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error(tr('WebGL2 fehlt'));
    this.float = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); } return { p, u }; };
    this.P = { falt: prog(FS_FALT), div: prog(FS_DIV), mul: prog(FS_MUL), lin: prog(FS_LIN), mix: prog(FS_MIX), lokal: prog(FS_LOKAL) };
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.max = gl.getParameter(gl.MAX_TEXTURE_SIZE); this.ziele = []; this.w = 0; this.h = 0;
    this.leer = this.tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.pinsel = [this.tex(), this.tex()];
  }
  tex() { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; }
  upload(t, quelle) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, quelle); }
  groesse(w, h) {
    const gl = this.gl; this.w = w; this.h = h; if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } if (this.zieleW === w && this.zieleH === h) return; this.zieleW = w; this.zieleH = h;
    for (const z of this.ziele) { gl.deleteTexture(z.t); gl.deleteFramebuffer(z.f); } this.ziele = [];
    for (let i = 0; i < 6; i++) {
      const t = this.tex(); gl.texImage2D(gl.TEXTURE_2D, 0, this.float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this.ziele.push({ t, f });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  lauf(prog, ziel, setze) {
    const gl = this.gl, P = this.P[prog]; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, ziel ? ziel.f : null); gl.viewport(0, 0, this.w, this.h);
    gl.uniform2f(P.u.uSize, this.w, this.h); let einheit = 0;
    const tx = (name, t) => { gl.activeTexture(gl.TEXTURE0 + einheit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], einheit++); };
    setze(P.u, tx); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  /** Richardson-Lucy auf einer Fläche. d = { art: 'fokus'|'bewegung', radius, laenge, winkel, staerke } */
  entfalten(canvas, d) {
    const gl = this.gl, W = canvas.width, H = canvas.height; if (W > this.max || H > this.max) return canvas;
    this.groesse(W, H); const src = this.tex(); this.upload(src, canvas);
    const [ORIG, EST, T1, T2, T3] = this.ziele; const gl2 = gl;
    this.lauf('lin', ORIG, (u, tx) => { tx('uA', src); gl2.uniform1f(u.uDir, 1); });
    this.lauf('lin', EST, (u, tx) => { tx('uA', src); gl2.uniform1f(u.uDir, 1); });
    const bew = d.art === 'bewegung', a = (d.winkel || 0) * Math.PI / 180, sig = Math.max(0.4, d.radius || 1.5), len = Math.max(2, d.laenge || 8);
    const falt = (quelle, ziel, hilfs) => {
      if (bew) this.lauf('falt', ziel, (u, tx) => { tx('uT', quelle.t); gl2.uniform2f(u.uDir, Math.cos(a), Math.sin(a)); gl2.uniform1i(u.uArt, 1); gl2.uniform1f(u.uLen, len); gl2.uniform1f(u.uSigma, 1); });
      else { this.lauf('falt', hilfs, (u, tx) => { tx('uT', quelle.t); gl2.uniform2f(u.uDir, 1, 0); gl2.uniform1i(u.uArt, 0); gl2.uniform1f(u.uSigma, sig); gl2.uniform1f(u.uLen, 1); });
        this.lauf('falt', ziel, (u, tx) => { tx('uT', hilfs.t); gl2.uniform2f(u.uDir, 0, 1); gl2.uniform1i(u.uArt, 0); gl2.uniform1f(u.uSigma, sig); gl2.uniform1f(u.uLen, 1); }); }
    };
    const iter = Math.round(6 + (d.staerke ?? 60) / 100 * 24);
    let est = EST, frei = this.ziele[5];
    for (let i = 0; i < iter; i++) {
      falt(est, T1, T3);                                                     // H*est
      this.lauf('div', T2, (u, tx) => { tx('uA', ORIG.t); tx('uB', T1.t); }); // obs / (H*est)
      falt(T2, T1, T3);                                                      // H^T * Verhältnis (symmetrisch)
      this.lauf('mul', frei, (u, tx) => { tx('uA', est.t); tx('uB', T1.t); });
      [est, frei] = [frei, est];
    }
    this.lauf('lin', T2, (u, tx) => { tx('uA', est.t); gl2.uniform1f(u.uDir, -1); });
    this.lauf('mix', null, (u, tx) => { tx('uOrig', src); tx('uEst', T2.t); gl2.uniform1f(u.uMix, Math.min(1, 0.35 + (d.staerke ?? 60) / 100 * 0.75)); gl2.uniform1f(u.uFlip, 1); });
    gl.deleteTexture(src);
    const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(this.cv, 0, 0); return out;
  }
  /** lokale Anpassungen auf eine fertige Farb-Fläche anwenden */
  lokal(canvas, masken, { zeigen = -1, pinsel = [] } = {}) {
    const gl = this.gl, W = canvas.width, H = canvas.height; if (!masken?.length || W > this.max || H > this.max) return canvas;
    this.cv.width = W; this.cv.height = H; const altW = this.w, altH = this.h; this.w = W; this.h = H; const src = this.tex(); this.upload(src, canvas);
    pinsel.forEach((c, i) => c && this.upload(this.pinsel[i], c));
    const n = Math.min(8, masken.length), geo = new Float32Array(32), geo2 = new Float32Array(32), typ = new Int32Array(8), inv = new Float32Array(8), A = new Float32Array(32), B = new Float32Array(32), C = new Float32Array(32);
    const v = (m, k) => (m.adj?.[k] || 0) / 100;
    for (let i = 0; i < n; i++) {
      const m = masken[i]; inv[i] = m.invert ? 1 : 0;
      if (m.typ === 'verlauf') { typ[i] = 0; geo.set([m.a[0], m.a[1], m.b[0], m.b[1]], i * 4); }
      else if (m.typ === 'radial') { typ[i] = 1; geo.set([m.c[0], m.c[1], m.r[0], m.r[1]], i * 4); geo2.set([(m.winkel || 0) * Math.PI / 180, (m.weich ?? 50) / 100, 0, 0], i * 4); }
      else { typ[i] = 2; geo.set([m.kanal || 0, 0, 0, 0], i * 4); }
      A.set([v(m, 'exposure'), v(m, 'contrast'), v(m, 'highlights'), v(m, 'shadows')], i * 4);
      B.set([v(m, 'temp'), v(m, 'tint'), v(m, 'saturation'), v(m, 'clarity')], i * 4);
      C.set([v(m, 'sharpen'), v(m, 'dehaze'), v(m, 'noise'), 0], i * 4);
    }
    this.lauf('lokal', null, (u, tx) => {
      tx('uImg', src); tx('uPinsel0', pinsel[0] ? this.pinsel[0] : this.leer); tx('uPinsel1', pinsel[1] ? this.pinsel[1] : this.leer);
      gl.uniform1i(u.uN, n); gl.uniform4fv(u.uGeo, geo); gl.uniform4fv(u.uGeo2, geo2); gl.uniform1iv(u.uTyp, typ); gl.uniform1fv(u.uInv, inv);
      gl.uniform4fv(u.uA, A); gl.uniform4fv(u.uB, B); gl.uniform4fv(u.uC, C); gl.uniform1f(u.uZeig, zeigen >= 0 ? 1 : 0); gl.uniform1i(u.uAktiv, zeigen);
    });
    gl.deleteTexture(src); this.w = altW; this.h = altH;
    const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(this.cv, 0, 0); return out;
  }
}
let inst = null;
export const gx = () => (inst ||= new GX());

/* ───────── Pinselmasken: als Liste von Strichen gespeichert (relativ), hier in Flächen umgerechnet ───────── */
export function pinselFlaechen(masken, W, H) {
  const pinsel = masken.filter(m => m.typ === 'pinsel' || m.typ === 'himmel');
  if (!pinsel.length) return [];
  const k = Math.min(1, 1024 / Math.max(W, H)), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const daten = [new ImageData(w, h), new ImageData(w, h)];
  pinsel.forEach((m, i) => {
    if (i >= 8) return; m.kanal = i; const ziel = daten[i < 4 ? 0 : 1].data, kanal = i % 4;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (m.typ === 'himmel' && m.himmel) { const H0 = m.himmel, rgba = H0.a ? (() => { const u = new Uint8ClampedArray(H0.w * H0.h * 4); H0.a.forEach((v, j) => { u[j * 4] = u[j * 4 + 1] = u[j * 4 + 2] = 255; u[j * 4 + 3] = v; }); return u; })() : new Uint8ClampedArray(H0.data); const img = new ImageData(rgba, H0.w, H0.h); const t = document.createElement('canvas'); t.width = m.himmel.w; t.height = m.himmel.h; t.getContext('2d').putImageData(img, 0, 0); x.drawImage(t, 0, 0, w, h); }
    for (const s of m.striche || []) {
      x.save(); x.globalCompositeOperation = s.radieren ? 'destination-out' : 'source-over';
      const r = Math.max(1, s.groesse / 100 * Math.min(w, h)); const hart = (s.haerte ?? 50) / 100;
      const tupf = (X, Y) => { const g = x.createRadialGradient(X, Y, r * hart * .95, X, Y, r); g.addColorStop(0, `rgba(255,255,255,${s.fluss ?? 1})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill(); };
      const schritt = Math.max(1, r * 0.3); let vor = null;
      for (const [px, py] of s.pts) { const X = px * w, Y = py * h; if (vor) { const L = Math.hypot(X - vor[0], Y - vor[1]); for (let t = schritt; t < L; t += schritt) tupf(vor[0] + (X - vor[0]) * t / L, vor[1] + (Y - vor[1]) * t / L); } tupf(X, Y); vor = [X, Y]; }
      x.restore();
    }
    const d = x.getImageData(0, 0, w, h).data; for (let p = 0, q = 0; p < d.length; p += 4, q += 4) ziel[q + kanal] = Math.max(ziel[q + kanal], d[p + 3]);
  });
  // als ImageData zurückgeben (nicht vormultipliert – sonst gehen die Kanäle bei Alpha 0 verloren)
  return pinsel.length > 4 ? daten : [daten[0]];
}
/** Himmel automatisch erkennen (hell, bläulich/grau, zusammenhängend von oben) → kleine Maske */
export function himmelMaske(canvas) {
  const w = 192, h = Math.max(8, Math.round(192 * canvas.height / canvas.width)); const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data;
  const kand = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255; const L = .2126 * r + .7152 * g + .0722 * b; const blau = b - Math.max(r, g * .9); const grau = 1 - (Math.max(r, g, b) - Math.min(r, g, b)) * 3;
    const hell = blau > .1 ? (L - .15) * 3 : (L - .35) * 2.2; // kräftig blauer (tiefer) Himmel ist dunkler als ein grauer – trotzdem Himmel
    kand[i] = Math.max(0, Math.min(1, hell)) * Math.max(Math.min(1, blau * 6 + .4), Math.max(0, grau) * (L > .6 ? 1 : 0)); }
  // Kantenstärke: Himmel ist glatt
  const out = new Uint8ClampedArray(w * h * 4), erreicht = new Uint8Array(w * h), stapel = [];
  for (let x0 = 0; x0 < w; x0++) if (kand[x0] > .35) { erreicht[x0] = 1; stapel.push(x0); }
  while (stapel.length) { const i = stapel.pop(), px = i % w, py = (i / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (erreicht[j] || kand[j] < .3) continue; const grad = Math.abs(d[i * 4 + 1] - d[j * 4 + 1]); if (grad > 28) continue; erreicht[j] = 1; stapel.push(j); } }
  for (let i = 0; i < w * h; i++) { const v = erreicht[i] ? Math.min(1, kand[i] * 1.6) : 0; out[i * 4 + 3] = v * 255; }
  // weich zeichnen
  const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  const t2 = document.createElement('canvas'); t2.width = w; t2.height = h; const x2 = t2.getContext('2d'); x2.filter = 'blur(2px)'; x2.drawImage(t, 0, 0);
  const dd = x2.getImageData(0, 0, w, h).data, a = new Array(w * h); for (let i = 0; i < w * h; i++) a[i] = dd[i * 4 + 3];
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, h, a };
}
