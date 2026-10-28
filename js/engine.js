// TW Bildstudio – Bild-Engine
// Ablauf je Bild (nicht-destruktiv, das Original bleibt immer unverändert):
//   Original → Geometrie (Drehen 90°, Spiegeln, Perspektive, Gerade richten, Zuschnitt) [WebGL, eine Homographie]
//            → Retusche (Reparieren/Stempel) [2D]
//            → Farbe & Licht (Belichtung … Kurven, HSL, Klarheit, Schärfe, Rauschen, Vignette, Korn) [WebGL]
//            → Ebenen (Text, Rahmen) [2D]
// Alle Positionen sind relativ (0–1) gespeichert → Vorschau und volle Auflösung sehen gleich aus.
import { markupZeichnen } from './markup.js';
import { gx, pinselFlaechen } from './gl-extra.js';
import { tr, trz } from './i18n.js';

export const ADJ_DEFAULT = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temp: 0, tint: 0, vibrance: 0, saturation: 0,
  clarity: 0, dehaze: 0, sharpen: 0, noise: 0,
  vignette: 0, vignetteMid: 50, grain: 0, grainSize: 25, fade: 0,
  splitShHue: 220, splitShSat: 0, splitHiHue: 40, splitHiSat: 0, bw: 0
};
export const HSL_FARBEN = [
  { k: 'rot', name: tr('Rot'), hue: 0, farbe: '#e5484d' }, { k: 'orange', name: tr('Orange'), hue: 30, farbe: '#f08c2a' },
  { k: 'gelb', name: tr('Gelb'), hue: 58, farbe: '#e9cc2a' }, { k: 'gruen', name: tr('Grün'), hue: 120, farbe: '#3fb950' },
  { k: 'aqua', name: tr('Aqua'), hue: 180, farbe: '#2ec4c6' }, { k: 'blau', name: tr('Blau'), hue: 225, farbe: '#3b82f6' },
  { k: 'lila', name: tr('Lila'), hue: 275, farbe: '#9b5de5' }, { k: 'magenta', name: tr('Magenta'), hue: 315, farbe: '#e04fb3' }
];
export function neueBearbeitung() {
  return {
    v: 1,
    geo: { rot: 0, flipH: false, flipV: false, angle: 0, crop: null, ratio: 'frei', persp: { v: 0, h: 0 }, lens: { k: 0, ca: 0 } },
    deblur: { art: 'aus', radius: 1.5, laenge: 12, winkel: 0, staerke: 60 }, masken: [],
    adj: { ...ADJ_DEFAULT },
    hsl: Object.fromEntries(HSL_FARBEN.map(f => [f.k, [0, 0, 0]])),
    curves: { rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
    heal: [], text: [], markup: [], frame: { width: 0, color: '#ffffff' }, look: ''
  };
}
export function normalisiereBearbeitung(e) {
  const n = neueBearbeitung(); if (!e) return n;
  return {
    ...n, ...e, geo: { ...n.geo, ...(e.geo || {}), persp: { ...n.geo.persp, ...(e.geo?.persp || {}) }, lens: { ...n.geo.lens, ...(e.geo?.lens || {}) } }, adj: { ...n.adj, ...(e.adj || {}) },
    deblur: { ...n.deblur, ...(e.deblur || {}) }, masken: e.masken || [],
    hsl: { ...n.hsl, ...(e.hsl || {}) }, curves: { ...n.curves, ...(e.curves || {}) }, frame: { ...n.frame, ...(e.frame || {}) },
    heal: e.heal || [], text: e.text || [], markup: e.markup || []
  };
}
const istGerade = (pts) => !pts || (pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1);
export function istBearbeitet(e) {
  if (!e) return false; const n = neueBearbeitung();
  const g = normalisiereBearbeitung(e).geo; if (JSON.stringify(g) !== JSON.stringify(n.geo)) return true;
  if (e.deblur && e.deblur.art && e.deblur.art !== 'aus') return true; if (e.masken?.length) return true;
  for (const k in n.adj) if ((e.adj?.[k] ?? n.adj[k]) !== n.adj[k]) return true;
  for (const k in n.hsl) if ((e.hsl?.[k] || [0, 0, 0]).some(v => v)) return true;
  for (const k in n.curves) if (!istGerade(e.curves?.[k])) return true;
  return !!(e.heal?.length || e.text?.length || e.markup?.length || e.frame?.width);
}

/* ═════════════ Matrizen (3×3, zeilenweise) ═════════════ */
const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
const T = (x, y) => [1, 0, x, 0, 1, y, 0, 0, 1];
const S = (x, y) => [x, 0, 0, 0, y, 0, 0, 0, 1];
const R = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export const anwenden = (M, x, y) => { const X = M[0] * x + M[1] * y + M[2], Y = M[3] * x + M[4] * y + M[5], Z = M[6] * x + M[7] * y + M[8]; return [X / Z, Y / Z]; };
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C; if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
/** Homographie: 4 Punkte (x,y) → (u,v) */
export function homographie(von, nach) {
  const A = [], bv = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = von[i], [u, v] = nach[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); bv.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); bv.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [bv[c], bv[p]] = [bv[p], bv[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; bv[r] -= f * bv[c]; }
  }
  const h = bv.map((v, i) => v / A[i][i]); return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
export function orientiertGroesse(W, H, rot) { return (rot & 1) ? [H, W] : [W, H]; }
/** Zoom, damit beim Geraderichten keine leeren Ecken entstehen */
export function geradeZoom(W, H, grad) {
  const a = Math.abs(grad) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return Math.max((W * c + H * s) / W, (W * s + H * c) / H);
}
function perspEcken(p) {
  const a = (p?.v || 0) / 100 * 0.42, b = (p?.h || 0) / 100 * 0.42;
  const at = Math.max(a, 0), ab = Math.max(-a, 0), bl = Math.max(b, 0), br = Math.max(-b, 0);
  return [[-(1 - at), -(1 - bl)], [1 - at, -(1 - br)], [1 - ab, 1 - br], [-(1 - ab), 1 - bl]];
}
/** Matrix Ausgabepixel → Quell-UV (0–1). crop = null → ganzer Rahmen */
export function geoMatrix(geo, W, H, f, ganzerRahmen = false) {
  const [Wo, Ho] = orientiertGroesse(W, H, geo.rot || 0);
  const cr = (!ganzerRahmen && geo.crop) || { x: 0, y: 0, w: 1, h: 1 };
  const th = (geo.angle || 0) * Math.PI / 180, s = geradeZoom(Wo, Ho, geo.angle || 0);
  let M = mul(T(cr.x * Wo - Wo / 2, cr.y * Ho - Ho / 2), S(1 / f, 1 / f));
  M = mul(mul(S(1 / s, 1 / s), R(-th)), M);
  M = mul(S(2 / Wo, 2 / Ho), M);
  M = mul(homographie([[-1, -1], [1, -1], [1, 1], [-1, 1]], perspEcken(geo.persp)), M);
  M = mul(S(Wo / 2, Ho / 2), M);
  // Spiegeln (wie gesehen), dann Drehung zurück
  M = mul(S(geo.flipH ? -1 : 1, geo.flipV ? -1 : 1), M);
  for (let i = 0; i < ((geo.rot || 0) & 3); i++) M = mul([0, 1, 0, -1, 0, 0, 0, 0, 1], M);
  M = mul(mul(T(0.5, 0.5), S(1 / W, 1 / H)), M);
  return M;
}
export function ausgabeGroesse(geo, W, H, maxW = Infinity, maxH = Infinity, ganzerRahmen = false) {
  const [Wo, Ho] = orientiertGroesse(W, H, geo.rot || 0);
  const cr = (!ganzerRahmen && geo.crop) || { w: 1, h: 1 };
  const cw = cr.w * Wo, ch = cr.h * Ho; const f = Math.min(1, maxW / cw, maxH / ch);
  return { w: Math.max(1, Math.round(cw * f)), h: Math.max(1, Math.round(ch * f)), f, cw, ch, Wo, Ho };
}

/* ═════════════ Kurven ═════════════ */
/** monotone kubische Interpolation (Fritsch–Carlson) → 256 Werte */
export function kurveLUT(pts) {
  const p = [...(pts || [[0, 0], [1, 1]])].sort((a, b) => a[0] - b[0]); const n = p.length, out = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i / 255; return out; }
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(Math.max(1e-6, p[i + 1][0] - p[i][0])); dy.push((p[i + 1][1] - p[i][1]) / dx[i]); }
  m.push(dy[0]); for (let i = 1; i < n - 1; i++) m.push(dy[i - 1] * dy[i] <= 0 ? 0 : (dy[i - 1] + dy[i]) / 2); m.push(dy[n - 2]);
  for (let i = 0; i < n - 1; i++) { if (dy[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / dy[i], b = m[i + 1] / dy[i], h = a * a + b * b; if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * dy[i]; m[i + 1] = t * b * dy[i]; } }
  for (let k = 0; k < 256; k++) {
    const x = k / 255; let i = 0; if (x <= p[0][0]) { out[k] = p[0][1]; continue; } if (x >= p[n - 1][0]) { out[k] = p[n - 1][1]; continue; }
    while (i < n - 2 && x > p[i + 1][0]) i++;
    const h = dx[i], t = (x - p[i][0]) / h, t2 = t * t, t3 = t2 * t;
    out[k] = Math.min(1, Math.max(0, (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1]));
  }
  return out;
}
function lutBytes(curves) {
  const M = kurveLUT(curves.rgb), r = kurveLUT(curves.r), g = kurveLUT(curves.g), b = kurveLUT(curves.b);
  const look = (L, v) => L[Math.max(0, Math.min(255, Math.round(v * 255)))];
  const d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { const m = M[i]; d[i * 4] = look(r, m) * 255; d[i * 4 + 1] = look(g, m) * 255; d[i * 4 + 2] = look(b, m) * 255; d[i * 4 + 3] = 255; }
  return d;
}

/* ═════════════ WebGL ═════════════ */
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_GEO = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform mat3 uM; uniform vec2 uOut; uniform float uK; uniform float uCA; uniform float uAsp;
out vec4 o;
void main(){
  vec2 px = vec2(gl_FragCoord.x, uOut.y - gl_FragCoord.y);
  vec3 q = uM * vec3(px, 1.0); vec2 uv = q.xy / q.z;
  vec2 c = uv - 0.5; vec2 ca = c * vec2(uAsp, 1.0); float r2 = dot(ca, ca);
  uv = 0.5 + c * (1.0 + uK * r2);
  if (uv.x < -0.0005 || uv.y < -0.0005 || uv.x > 1.0005 || uv.y > 1.0005) { o = vec4(0.0); return; }
  vec4 m = texture(uSrc, clamp(uv, 0.0, 1.0));
  if (uCA != 0.0) { vec2 d = uv - 0.5; m.r = texture(uSrc, clamp(0.5 + d * (1.0 - uCA), 0.0, 1.0)).r; m.b = texture(uSrc, clamp(0.5 + d * (1.0 + uCA), 0.0, 1.0)).b; }
  o = m;
}`;
const FS_COL = `#version 300 es
precision highp float;
uniform sampler2D uImg; uniform sampler2D uBlur; uniform sampler2D uLut;
uniform vec2 uSize; uniform float uStep;
uniform float uExp, uCon, uHi, uSh, uWh, uBl, uTemp, uTint, uVib, uSat, uClar, uDehaze, uSharp, uNoise, uVig, uVigMid, uGrain, uGrainSize, uFade, uBw, uLutOn;
uniform vec3 uHsl[8]; uniform float uHue[8];
uniform vec4 uSplit;
out vec4 o;
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1., 2./3., 1./3., 3.); vec3 p = abs(fract(c.xxx + K.xyz) * 6. - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0., 1.), c.y); }
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0., -1./3., 2./3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1e-10; return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uSize;
  vec2 px = uStep / uSize;
  vec4 src = texture(uImg, uv);
  vec3 c = src.rgb;
  if (uNoise > 0.0) {
    vec3 acc = vec3(0.); float ws = 0.;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec3 s = texture(uImg, uv + vec2(float(i), float(j)) * px).rgb; float d = distance(s, src.rgb);
      float w = exp(-d * d / (0.002 + 0.02 * uNoise)) * exp(-float(i * i + j * j) / 6.0); acc += s * w; ws += w; }
    c = mix(c, acc / ws, min(1.0, uNoise * 1.2));
  }
  vec3 nb = (texture(uImg, uv + vec2(px.x, 0.)).rgb + texture(uImg, uv - vec2(px.x, 0.)).rgb + texture(uImg, uv + vec2(0., px.y)).rgb + texture(uImg, uv - vec2(0., px.y)).rgb) * 0.25;
  float detail = lum(c) - lum(mix(nb, c, uNoise * 0.6));
  vec3 bl = texture(uBlur, uv).rgb; float Lb = lum(bl);
  // Belichtung + Weißabgleich (linear)
  vec3 lin = pow(max(c, 0.), vec3(2.2)) * exp2(uExp);
  vec3 wb = vec3(1. + uTemp * 0.5, 1. - uTint * 0.3, 1. - uTemp * 0.5); wb /= lum(wb);
  lin *= wb;
  c = pow(max(lin, 0.), vec3(1. / 2.2));
  // Lichter / Tiefen (lokal über unscharfe Luminanz)
  float L = lum(c); float Lm = mix(L, Lb, 0.55);
  float hiM = smoothstep(0.42, 1.0, Lm), shM = 1. - smoothstep(0.0, 0.55, Lm);
  float dl = uHi * 0.30 * hiM + uSh * 0.34 * shM;
  c += dl * mix(vec3(1.), c / max(L, 0.04), 0.55);
  // Weiß / Schwarz
  float wp = 1. - uWh * 0.22, bp = -uBl * 0.12; c = (c - bp) / max(0.05, wp - bp);
  // Kontrast
  c = (c - 0.47) * (1. + uCon * (uCon > 0. ? 0.7 : 0.5)) + 0.47;
  // Klarheit (Mitteltöne)
  L = lum(c); float mid = 1. - pow(abs(2. * clamp(L, 0., 1.) - 1.), 2.);
  c += (L - Lb) * uClar * 1.6 * mid * mix(vec3(1.), c / max(L, 0.04), 0.5);
  // Dunst entfernen
  if (uDehaze != 0.) { float d = uDehaze * 0.10; c = (c - d) / (1. - d); }
  // Gradationskurven
  if (uLutOn > 0.5) { vec3 k = clamp(c, 0., 1.) * (255. / 256.) + 0.5 / 256.; c = vec3(texture(uLut, vec2(k.r, 0.5)).r, texture(uLut, vec2(k.g, 0.5)).g, texture(uLut, vec2(k.b, 0.5)).b); }
  // Farbmischer HSL
  vec3 hsv = rgb2hsv(clamp(c, 0., 1.)); float hue = hsv.x * 360.; vec3 a = vec3(0.);
  for (int i = 0; i < 8; i++) { float dh = abs(mod(hue - uHue[i] + 180., 360.) - 180.); float w = 1. - smoothstep(0., 42., dh); a += uHsl[i] * w; }
  if (a != vec3(0.)) { hsv.x = fract(hsv.x + a.x * 30. / 360.); hsv.y = clamp(hsv.y * (1. + a.y), 0., 1.); hsv.z = clamp(hsv.z * (1. + a.z * 0.45 * smoothstep(0.05, 0.4, hsv.y)), 0., 1.); c = hsv2rgb(hsv); }
  // Dynamik / Sättigung
  float L2 = lum(c); float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float skin = smoothstep(0.08, 0.0, abs(hsv.x - 0.07)) * 0.5;
  c = mix(vec3(L2), c, 1. + uVib * (1. - sat) * 1.3 * (1. - skin) + uDehaze * 0.18);
  c = mix(vec3(lum(c)), c, 1. + uSat);
  if (uBw > 0.5) c = vec3(lum(c));
  // Teiltonung
  L2 = clamp(lum(c), 0., 1.);
  vec3 shC = hsv2rgb(vec3(uSplit.x, 1., 1.)); vec3 hiC = hsv2rgb(vec3(uSplit.z, 1., 1.));
  c += (shC - lum(shC)) * uSplit.y * 0.22 * (1. - smoothstep(0., 0.5, L2));
  c += (hiC - lum(hiC)) * uSplit.w * 0.22 * smoothstep(0.5, 1., L2);
  // Verblassen
  c = mix(c, c * 0.84 + 0.09, uFade);
  // Vignette
  float r = length((uv - 0.5) * 2.) / 1.4142;
  float v = smoothstep(uVigMid, 1.05, r);
  if (uVig < 0.) c *= 1. + uVig * v * 0.95; else c = mix(c, vec3(1.), uVig * v * 0.85);
  // Korn
  if (uGrain > 0.) { float g = hash(floor(gl_FragCoord.xy / max(1., uGrainSize * uStep)) + 0.37) - 0.5; c += g * uGrain * 0.16 * (1. - abs(2. * lum(c) - 1.) * 0.6); }
  // Schärfen
  c += detail * uSharp * 2.4;
  o = vec4(clamp(c, 0., 1.), src.a);
}`;

class GL {
  constructor() { this.init(); }
  init() {
    this.cv = document.createElement('canvas'); this.cv.width = 4; this.cv.height = 4;
    const gl = this.gl = this.cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
    if (!gl) throw new Error(tr('Dieser Browser kann kein WebGL2 – bitte Chrome oder Edge verwenden.'));
    this.cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.verloren = true; });
    this.cv.addEventListener('webglcontextrestored', () => { this.verloren = false; this.init(); });
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); } return { p, u }; };
    this.geo = prog(FS_GEO); this.col = prog(FS_COL);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.srcTex = null; this.srcKey = null; this.imgTex = this.tex(); this.blurTex = this.tex(); this.lutTex = this.tex();
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  }
  tex() { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; }
  upload(t, quelle, mip = false) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, quelle);
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  /** Original hochladen (einmal je Bild) */
  quelle(bmp, key) {
    if (this.srcKey === key && this.srcTex) return;
    const gl = this.gl; if (!this.srcTex) this.srcTex = this.tex();
    let q = bmp;
    if (bmp.width > this.max || bmp.height > this.max) { const f = this.max / Math.max(bmp.width, bmp.height); q = document.createElement('canvas'); q.width = Math.floor(bmp.width * f); q.height = Math.floor(bmp.height * f); const x = q.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, q.width, q.height); }
    this.upload(this.srcTex, q, true); this.srcKey = key; this.srcW = bmp.width; this.srcH = bmp.height;
  }
  groesse(w, h) { if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } this.gl.viewport(0, 0, w, h); }
  /** Geometrie rendern → in eine neue 2D-Fläche kopieren */
  geometrie(geo, maxW, maxH, ganzerRahmen = false, ziel = null) {
    const gl = this.gl, g = ausgabeGroesse(geo, this.srcW, this.srcH, maxW, maxH, ganzerRahmen);
    if (g.w > this.max || g.h > this.max) { const k = this.max / Math.max(g.w, g.h); return this.geometrie(geo, g.w * k, g.h * k, ganzerRahmen, ziel); }
    const Mx = geoMatrix(geo, this.srcW, this.srcH, g.w / g.cw, ganzerRahmen); // Faktor nach Rundung
    this.groesse(g.w, g.h); gl.useProgram(this.geo.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex); gl.uniform1i(this.geo.u.uSrc, 0);
    gl.uniformMatrix3fv(this.geo.u.uM, true, new Float32Array(Mx)); gl.uniform2f(this.geo.u.uOut, g.w, g.h);
    const L = geo.lens || {}; gl.uniform1f(this.geo.u.uK, -(L.k || 0) / 100 * 0.35); gl.uniform1f(this.geo.u.uCA, (L.ca || 0) / 100 * 0.004); gl.uniform1f(this.geo.u.uAsp, this.srcW / this.srcH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const c = ziel || document.createElement('canvas'); c.width = g.w; c.height = g.h;
    const x = c.getContext('2d', { willReadFrequently: false }); x.clearRect(0, 0, g.w, g.h); x.drawImage(this.cv, 0, 0);
    return { canvas: c, ...g };
  }
  /** Zwischenstand (nach Retusche) als Arbeitsbild für die Farbstufe übernehmen */
  arbeitsbild(canvas, besitzer = null) {
    this.besitzer = besitzer; this.upload(this.imgTex, canvas);
    const bw = Math.max(16, Math.min(512, canvas.width)), bh = Math.max(16, Math.round(bw * canvas.height / canvas.width));
    const b = document.createElement('canvas'); b.width = bw; b.height = bh; const x = b.getContext('2d');
    x.filter = `blur(${Math.max(2, bw * 0.014).toFixed(1)}px)`; x.drawImage(canvas, -bw * 0.04, -bh * 0.04, bw * 1.08, bh * 1.08);
    this.upload(this.blurTex, b); this.aw = canvas.width; this.ah = canvas.height;
  }
  kurven(curves) {
    const key = JSON.stringify(curves); if (key === this.lutKey) return; this.lutKey = key;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutBytes(curves));
  }
  farbe(e) {
    const gl = this.gl, a = e.adj, u = this.col.u, w = this.aw, h = this.ah;
    this.groesse(w, h); gl.useProgram(this.col.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.imgTex); gl.uniform1i(u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.blurTex); gl.uniform1i(u.uBlur, 1);
    const kurvenAn = ['rgb', 'r', 'g', 'b'].some(k => !istGerade(e.curves[k]));
    this.kurven(e.curves); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lutTex); gl.uniform1i(u.uLut, 2);
    gl.uniform2f(u.uSize, w, h); gl.uniform1f(u.uStep, Math.max(1, Math.max(w, h) / 2200));
    const v = (k) => (a[k] || 0) / 100;
    gl.uniform1f(u.uExp, (a.exposure || 0) / 100 * 4); gl.uniform1f(u.uCon, v('contrast')); gl.uniform1f(u.uHi, v('highlights')); gl.uniform1f(u.uSh, v('shadows'));
    gl.uniform1f(u.uWh, v('whites')); gl.uniform1f(u.uBl, v('blacks')); gl.uniform1f(u.uTemp, v('temp')); gl.uniform1f(u.uTint, v('tint'));
    gl.uniform1f(u.uVib, v('vibrance')); gl.uniform1f(u.uSat, v('saturation')); gl.uniform1f(u.uClar, v('clarity')); gl.uniform1f(u.uDehaze, v('dehaze'));
    gl.uniform1f(u.uSharp, v('sharpen')); gl.uniform1f(u.uNoise, v('noise')); gl.uniform1f(u.uVig, v('vignette')); gl.uniform1f(u.uVigMid, 0.15 + v('vignetteMid') * 0.7);
    gl.uniform1f(u.uGrain, v('grain')); gl.uniform1f(u.uGrainSize, 1 + v('grainSize') * 4); gl.uniform1f(u.uFade, v('fade')); gl.uniform1f(u.uBw, a.bw ? 1 : 0); gl.uniform1f(u.uLutOn, kurvenAn ? 1 : 0);
    const hsl = new Float32Array(24), hue = new Float32Array(8);
    HSL_FARBEN.forEach((f, i) => { const x = e.hsl[f.k] || [0, 0, 0]; hsl[i * 3] = x[0] / 100; hsl[i * 3 + 1] = x[1] / 100; hsl[i * 3 + 2] = x[2] / 100; hue[i] = f.hue; });
    gl.uniform3fv(u.uHsl, hsl); gl.uniform1fv(u.uHue, hue);
    gl.uniform4f(u.uSplit, (a.splitShHue || 0) / 360, v('splitShSat'), (a.splitHiHue || 0) / 360, v('splitHiSat'));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.cv;
  }
}
let glInst = null;
export function gl() { if (!glInst || glInst.verloren) glInst = new GL(); return glInst; }
export function webglOk() { try { gl(); return true; } catch (e) { console.error(e); return false; } }

/* ═════════════ Retusche ═════════════ */
/** Quelle für einen Reparatur-Punkt automatisch suchen (ähnlichster Ring in 8 Richtungen) */
export function healQuelleSuchen(canvas, x, y, r) {
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rp = Math.max(2, r * W), cx = x * W, cy = y * H, R2 = Math.ceil(rp * 1.35);
  const ring = (ox, oy) => { const x0 = Math.round(ox - R2), y0 = Math.round(oy - R2); if (x0 < 0 || y0 < 0 || x0 + 2 * R2 >= W || y0 + 2 * R2 >= H) return null; return ctx.getImageData(x0, y0, 2 * R2, 2 * R2).data; };
  const ziel = ring(cx, cy); let best = null, bestD = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, d = rp * (k % 2 ? 2.4 : 2.0), ox = cx + Math.cos(a) * d, oy = cy + Math.sin(a) * d;
    const q = ring(ox, oy); if (!q) continue;
    let sum = 0, n = 0;
    if (ziel) {
      for (let j = 0; j < 2 * R2; j += 2) for (let i = 0; i < 2 * R2; i += 2) { const dx = i - R2, dy = j - R2, dd = Math.sqrt(dx * dx + dy * dy); if (dd < rp || dd > R2) continue; const o = (j * 2 * R2 + i) * 4; sum += Math.abs(ziel[o] - q[o]) + Math.abs(ziel[o + 1] - q[o + 1]) + Math.abs(ziel[o + 2] - q[o + 2]); n++; }
    }
    // Quelle selbst soll ruhig sein (wenig Struktur)
    let v = 0; for (let o = 0; o < q.length; o += 16) v += Math.abs(q[o] - q[o + 4] || 0);
    const score = (n ? sum / n : 0) + v / (q.length / 16) * 0.3;
    if (score < bestD) { bestD = score; best = [ox / W, oy / H]; }
  }
  return best || [Math.min(0.95, x + r * 2.2), y];
}
export function retusche(canvas, ops) {
  if (!ops?.length) return canvas;
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const op of ops) {
    const rp = Math.max(1.5, op.r * W), cx = op.x * W, cy = op.y * H, sx = op.sx * W, sy = op.sy * H;
    const R2 = Math.ceil(rp * 1.2), x0 = Math.round(cx - R2), y0 = Math.round(cy - R2), w = 2 * R2, h = 2 * R2;
    const qx = Math.round(sx - R2), qy = Math.round(sy - R2);
    if (x0 >= W || y0 >= H || x0 + w <= 0 || y0 + h <= 0) continue;
    const zi = ctx.getImageData(x0, y0, w, h), qu = ctx.getImageData(qx, qy, w, h), z = zi.data, q = qu.data;
    let kr = 0, kg = 0, kb = 0;
    if (op.t !== 'clone') { // Helligkeit/Farbe an den Rand angleichen
      let n = 0, zr = 0, zg = 0, zb = 0, qr = 0, qg = 0, qb = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const dx = i - R2, dy = j - R2, dd = Math.sqrt(dx * dx + dy * dy); if (dd < rp * 0.95 || dd > rp * 1.18) continue; const o = (j * w + i) * 4; if (!q[o + 3] || !z[o + 3]) continue; zr += z[o]; zg += z[o + 1]; zb += z[o + 2]; qr += q[o]; qg += q[o + 1]; qb += q[o + 2]; n++; }
      if (n) { kr = (zr - qr) / n; kg = (zg - qg) / n; kb = (zb - qb) / n; }
    }
    const weich = op.weich ?? 0.45;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = i - R2, dy = j - R2, dd = Math.sqrt(dx * dx + dy * dy) / rp; if (dd >= 1) continue;
      const m = dd < 1 - weich ? 1 : (1 - dd) / weich, mm = m * m * (3 - 2 * m); const o = (j * w + i) * 4; if (!q[o + 3]) continue;
      z[o] += (q[o] + kr - z[o]) * mm; z[o + 1] += (q[o + 1] + kg - z[o + 1]) * mm; z[o + 2] += (q[o + 2] + kb - z[o + 2]) * mm;
    }
    ctx.putImageData(zi, x0, y0);
  }
  return canvas;
}

/* ═════════════ Ebenen: Text & Rahmen ═════════════ */
export const SCHRIFTEN = ['Oswald', 'Source Sans 3', 'Montserrat', 'Playfair Display', 'Bebas Neue', 'Dancing Script', 'Arial', 'Georgia', 'Courier New'];
export function textFont(t, W, H) { const px = Math.max(6, (t.size || 6) / 100 * Math.min(W, H)); return { px, font: `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${px}px "${t.font || 'Oswald'}", Arial, sans-serif` }; }
export function textMasse(ctx, t, W, H) {
  const { px, font } = textFont(t, W, H); ctx.font = font; const zeilen = String(t.text || '').split('\n');
  const lh = px * 1.18, breite = Math.max(...zeilen.map(z => ctx.measureText(z).width), 1), hoehe = lh * zeilen.length;
  const pad = t.box ? px * 0.35 : 0; const x = t.x * W, y = t.y * H;
  const left = t.align === 'left' ? x : t.align === 'right' ? x - breite : x - breite / 2;
  return { px, font, zeilen, lh, breite, hoehe, pad, x, y, left, top: y - hoehe / 2, rect: [left - pad, y - hoehe / 2 - pad, breite + 2 * pad, hoehe + 2 * pad] };
}
export function textZeichnen(ctx, liste, W, H) {
  for (const t of liste || []) {
    if (!t.text) continue; const m = textMasse(ctx, t, W, H);
    ctx.save(); ctx.globalAlpha = (t.opacity ?? 100) / 100; ctx.font = m.font; ctx.textBaseline = 'middle'; ctx.textAlign = t.align || 'center';
    if (t.box) { ctx.fillStyle = t.boxColor || 'rgba(0,0,0,.55)'; const [rx, ry, rw, rh] = m.rect; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, m.px * 0.18) : ctx.rect(rx, ry, rw, rh); ctx.fill(); }
    if (t.shadow) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = m.px * 0.18; ctx.shadowOffsetY = m.px * 0.05; }
    if (t.outline) { ctx.lineWidth = Math.max(1, m.px * 0.06); ctx.strokeStyle = t.outlineColor || '#000'; m.zeilen.forEach((z, i) => ctx.strokeText(z, m.x, m.top + m.lh * (i + 0.5))); }
    ctx.fillStyle = t.color || '#ffffff';
    m.zeilen.forEach((z, i) => ctx.fillText(z, m.x, m.top + m.lh * (i + 0.5)));
    ctx.restore();
  }
}
export function rahmen(canvas, fr) {
  if (!fr?.width) return canvas;
  const b = Math.round(fr.width / 100 * Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas'); c.width = canvas.width + 2 * b; c.height = canvas.height + 2 * b;
  const x = c.getContext('2d'); x.fillStyle = fr.color || '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, b, b);
  if (fr.linie) { x.strokeStyle = fr.linieFarbe || '#000'; x.lineWidth = Math.max(1, b * 0.06); x.strokeRect(b - x.lineWidth / 2, b - x.lineWidth / 2, canvas.width + x.lineWidth, canvas.height + x.lineWidth); }
  return c;
}

/* ═════════════ Komplett rendern ═════════════ */
/** Bild mit allen Bearbeitungen rendern. Rückgabe: Canvas */
export function rendern(bmp, key, edit, { maxW = Infinity, maxH = Infinity, ebenen = true, ganzerRahmen = false, ohneFarbe = false } = {}) {
  const e = normalisiereBearbeitung(edit); const G = gl(); G.quelle(bmp, key);
  const g = G.geometrie(e.geo, maxW, maxH, ganzerRahmen);
  let basis = g.canvas;
  if (!ganzerRahmen) { retusche(basis, e.heal); basis = entfalten(basis, e.deblur, g.w / (g.cw || g.w)); }
  if (ohneFarbe) return basis;
  G.arbeitsbild(basis, null); const out = G.farbe(e);
  let c = document.createElement('canvas'); c.width = out.width; c.height = out.height; c.getContext('2d').drawImage(out, 0, 0);
  if (!ganzerRahmen && e.masken?.length) c = lokal(c, e.masken);
  const x = c.getContext('2d');
  if (ebenen && !ganzerRahmen) { markupZeichnen(x, e.markup, c.width, c.height); textZeichnen(x, e.text, c.width, c.height); return rahmen(c, e.frame); }
  return c;
}

/** Unschärfe-Rettung (Richardson-Lucy) – gibt die Fläche unverändert zurück, wenn aus */
export function entfalten(canvas, d, skala = 1) {
  if (!d || !d.art || d.art === 'aus') return canvas;
  // Radius/Länge sind in Pixeln des Originalbilds angegeben → auf die aktuelle Größe umrechnen
  d = { ...d, radius: (d.radius || 1.5) * skala, laenge: (d.laenge || 8) * skala }; if (d.art === 'fokus' ? d.radius < 0.35 : d.laenge < 1.5) return canvas;
  try {
    const T = 2048, R = 96, W = canvas.width, H = canvas.height;
    if (W <= T && H <= T) return gx().entfalten(canvas, d);
    // große Bilder in Kacheln mit Überlappung (sonst zu viel Grafikspeicher)
    const out = document.createElement('canvas'); out.width = W; out.height = H; const ox = out.getContext('2d');
    for (let y = 0; y < H; y += T - 2 * R) for (let x = 0; x < W; x += T - 2 * R) {
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), w = Math.min(W - x0, T), h = Math.min(H - y0, T);
      const k = document.createElement('canvas'); k.width = w; k.height = h; k.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
      const r = gx().entfalten(k, d); const ix = x === 0 ? 0 : R, iy = y === 0 ? 0 : R;
      ox.drawImage(r, ix, iy, w - ix, h - iy, x0 + ix, y0 + iy, w - ix, h - iy);
      if (x0 + w >= W) break;
    }
    return out;
  } catch (err) { console.warn('Entfalten', err); return canvas; }
}
/** Lokale Anpassungen (Masken) */
let pinselCache = { key: '', daten: null };
export function lokal(canvas, masken, opt = {}) {
  try {
    const p = masken.filter(m => m.typ === 'pinsel' || m.typ === 'himmel'), key = canvas.width + 'x' + canvas.height + ':' + JSON.stringify(p.map(m => [m.typ, m.striche, m.himmel ? m.himmel.id || m.himmel.w : 0]));
    if (pinselCache.key !== key) pinselCache = { key, daten: pinselFlaechen(masken, canvas.width, canvas.height) };
    else p.forEach((m, i) => m.kanal = i);
    return gx().lokal(canvas, masken, { ...opt, pinsel: pinselCache.daten });
  } catch (err) { console.warn('Masken', err); return canvas; }
}

/* ═════════════ Analyse: Histogramm, Auto, Ausrichten ═════════════ */
export function histogramm(canvas) {
  const w = Math.min(320, canvas.width), h = Math.max(1, Math.round(w * canvas.height / canvas.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++; l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++; }
  return { r, g, b, l, n: w * h };
}
export function histogrammZeichnen(cv, H) {
  const x = cv.getContext('2d'), W = cv.width, Hh = cv.height; x.clearRect(0, 0, W, Hh);
  let max = 1; for (const a of [H.r, H.g, H.b]) for (let i = 2; i < 254; i++) max = Math.max(max, a[i]);
  x.globalCompositeOperation = 'lighter';
  for (const [a, f] of [[H.r, 'rgba(230,70,70,.75)'], [H.g, 'rgba(70,200,90,.75)'], [H.b, 'rgba(70,120,240,.75)']]) {
    x.fillStyle = f; x.beginPath(); x.moveTo(0, Hh);
    for (let i = 0; i < 256; i++) x.lineTo(i / 255 * W, Hh - Math.min(1, Math.sqrt(a[i] / max)) * Hh);
    x.lineTo(W, Hh); x.closePath(); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  const clipL = H.l[0] / H.n > 0.004, clipH = H.l[255] / H.n > 0.004;
  if (clipL) { x.fillStyle = '#3b82f6'; x.fillRect(0, 0, 6, 6); } if (clipH) { x.fillStyle = '#ef4444'; x.fillRect(W - 6, 0, 6, 6); }
}
/** Mittelwert der fast-neutralen Bildpunkte (Wände, Fugen, Beton) – robuster als Grauwelt über alle Farben */
export function neutralMittel(canvas) {
  const w = Math.min(320, canvas.width), h = Math.max(1, Math.round(w * canvas.height / canvas.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; let r = 0, g = 0, b = 0, n = 0, R = 0, G = 0, B = 0, N = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i], e = d[i + 1], f = d[i + 2], mx = Math.max(a, e, f), mn = Math.min(a, e, f), l = 0.2126 * a + 0.7152 * e + 0.0722 * f;
    if (l < 35 || mx > 250) continue; R += a; G += e; B += f; N++;
    if ((mx - mn) / mx < 0.36) { r += a; g += e; b += f; n++; }
  }
  const anteil = N ? n / N : 0;
  if (n > 200 && anteil > 0.04) return { r: r / n, g: g / n, b: b / n, anteil, sicher: true };
  return N ? { r: R / N, g: G / N, b: B / N, anteil, sicher: false } : { r: 1, g: 1, b: 1, anteil: 0, sicher: false };
}
/** Automatisch optimieren: Tonwerte, Weißabgleich (neutrale Flächen), etwas Dynamik */
export function autoWerte(canvas) {
  const H = histogramm(canvas); const pct = (a, p) => { let s = 0; const t = H.n * p; for (let i = 0; i < 256; i++) { s += a[i]; if (s >= t) return i; } return 255; };
  const lo = pct(H.l, 0.005), hi = pct(H.l, 0.995); let sum = 0; for (let i = 0; i < 256; i++) sum += i * H.l[i]; const mean = sum / H.n / 255;
  // Weißabgleich: genaue Umkehrung des Shaders (wie die Pipette) auf den Mittelwert der neutralen Flächen; ohne sichere neutrale Flächen nur vorsichtig
  const N = neutralMittel(canvas), wb = pipetteAusFarbe(N.r, N.g, N.b), k = N.sicher ? 0.9 : 0.4;
  const exp = Math.max(-60, Math.min(60, Math.log2(0.46 / Math.max(0.05, mean)) / 4 * 100 * 0.7));
  const r = (v) => Math.round(v);
  return {
    exposure: r(exp), whites: r(Math.max(-40, Math.min(60, (255 - hi) / 255 * 160))), blacks: r(Math.max(-40, Math.min(40, -(lo / 255) * 140))),
    contrast: 8, highlights: r(hi > 245 ? -25 : -10), shadows: r(mean < 0.35 ? 25 : 10),
    temp: r(Math.max(N.sicher ? -60 : -20, Math.min(N.sicher ? 60 : 20, wb.temp * k))), tint: r(Math.max(N.sicher ? -40 : -12, Math.min(N.sicher ? 40 : 12, wb.tint * k))),
    vibrance: 18, clarity: 10
  };
}
/** Weißabgleich per Pipette: Farbe an Stelle (x,y 0–1) neutral machen */
export function pipetteWB(canvas, x, y) {
  const c = canvas.getContext('2d', { willReadFrequently: true }); const px = Math.round(x * canvas.width), py = Math.round(y * canvas.height);
  const d = c.getImageData(Math.max(0, px - 3), Math.max(0, py - 3), 7, 7).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const w = pipetteAusFarbe(r / n, g / n, b / n); return { temp: Math.round(w.temp), tint: Math.round(w.tint) };
}
/** Temperatur/Tönung, die die Farbe (r,g,b 0–255) neutral grau macht – genaue Umkehrung des Weißabgleichs im Shader: wb = (1+.5t, 1-.3u, 1-.5t) */
export function pipetteAusFarbe(r, g, b) {
  const lr = Math.pow(r / 255, 2.2), lg = Math.pow(g / 255, 2.2), lb = Math.pow(b / 255, 2.2);
  const t = Math.max(-1, Math.min(1, (lb - lr) / (0.5 * (lr + lb) + 1e-4)));
  const m = ((1 + 0.5 * t) * lr + (1 - 0.5 * t) * lb) / 2;
  const u = Math.max(-1, Math.min(1, (1 - m / (lg + 1e-4)) / 0.3));
  return { temp: t * 100, tint: u * 100 };
}
/** Auto-Ausrichten: dominante fast-senkrechte/-waagerechte Kanten finden → Drehwinkel und Sicherheit (0–1) */
export function autoGeradeInfo(canvas) {
  const w = Math.min(480, canvas.width), h = Math.round(w * canvas.height / canvas.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const bins = new Float32Array(181); let total = 0; // −15…+15° in 1/6°
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx;
    const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
    const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
    const mag = Math.hypot(gx, gy); if (mag < 60) continue;
    let a = Math.atan2(gy, gx) * 180 / Math.PI; // Gradientenrichtung; Kante steht senkrecht dazu
    a = ((a % 90) + 90) % 90; if (a > 45) a -= 90; // Abweichung von Achse
    if (Math.abs(a) > 15) continue;
    bins[Math.round((a + 15) * 6)] += mag; total += mag;
  }
  let best = 90, bv = 0; for (let i = 0; i < 181; i++) { let s = 0; for (let k = -2; k <= 2; k++) s += bins[i + k] || 0; if (s > bv) { bv = s; best = i; } }
  const ang = best / 6 - 15, anteil = total ? bv / total : 0; // gleichverteilt wären ≈3 %
  return { winkel: Math.abs(ang) < 0.15 ? 0 : -Math.round(ang * 10) / 10, sicher: Math.max(0, Math.min(1, (anteil - 0.06) / 0.14)) };
}
export function autoGerade(canvas) { return autoGeradeInfo(canvas).winkel; }
