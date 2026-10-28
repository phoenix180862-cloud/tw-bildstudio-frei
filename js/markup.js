// TW Bildstudio – Einzeichnen & Markieren (Vorschläge für Bauherren, Mängel, Änderungen)
import { tr, trz } from './i18n.js';
// Alle Punkte relativ (0–1) zum fertig zugeschnittenen Bild. Stärke 1–12 (relativ zur Bildgröße).
export const MARKUP_WZ = [
  { t: 'pfeil', name: tr('Pfeil'), sym: '➚', tipp: tr('Ziehen: vom Ende zur Spitze') },
  { t: 'rechteck', name: tr('Rechteck'), sym: '▭', tipp: tr('Bereich aufziehen') },
  { t: 'ellipse', name: tr('Kreis'), sym: '◯', tipp: tr('Kreis/Ellipse aufziehen') },
  { t: 'wolke', name: tr('Wolke'), sym: '☁', tipp: tr('Änderungswolke wie im Bauplan') },
  { t: 'flaeche', name: tr('Fläche'), sym: '⬠', tipp: tr('Punkte klicken, Doppelklick/Enter schließt – Fläche wird farbig hinterlegt') },
  { t: 'frei', name: tr('Freihand'), sym: '✎', tipp: tr('Frei zeichnen') },
  { t: 'marker', name: tr('Marker'), sym: '▬', tipp: tr('Textmarker – halbtransparent hervorheben') },
  { t: 'linie', name: tr('Linie'), sym: '╱', tipp: tr('Gerade Linie (Umschalt = waagerecht/senkrecht)') },
  { t: 'masz', name: tr('Maß'), sym: '↔', tipp: tr('Maßkette mit Beschriftung (z. B. 1,20 m)') },
  { t: 'nummer', name: tr('Nummer'), sym: '①', tipp: tr('Nummerierter Punkt – Erklärung in der Legende') },
  { t: 'notiz', name: tr('Notiz'), sym: '💬', tipp: tr('Hinweis mit Pfeil: erst Ziel klicken, dann Textlage ziehen') },
  { t: 'kreuz', name: tr('Kreuz'), sym: '✕', tipp: tr('Durchstreichen: „entfällt / entfernen“') },
  { t: 'haken', name: tr('Haken'), sym: '✓', tipp: tr('In Ordnung / bleibt') }
];
export const sw = (m, W, H) => Math.max(1, (m.staerke || 4) * Math.min(W, H) / 380);
const P = (p, W, H) => [p[0] * W, p[1] * H];
function pfeilspitze(x, a, b, groesse, farbe) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  x.beginPath(); x.moveTo(b[0], b[1]);
  x.lineTo(b[0] - groesse * Math.cos(ang - 0.42), b[1] - groesse * Math.sin(ang - 0.42));
  x.lineTo(b[0] - groesse * Math.cos(ang + 0.42), b[1] - groesse * Math.sin(ang + 0.42)); x.closePath(); x.fillStyle = farbe; x.fill();
}
function etikett(x, text, cx, cy, px, farbe, hinter = 'rgba(255,255,255,.92)', textFarbe = '#111') {
  if (!text) return null; x.save(); x.font = `600 ${px}px "Source Sans 3", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const zeilen = String(text).split('\n'), lh = px * 1.2, w = Math.max(...zeilen.map(z => x.measureText(z).width)) + px * 0.9, h = lh * zeilen.length + px * 0.45;
  x.fillStyle = hinter; x.strokeStyle = farbe; x.lineWidth = Math.max(1, px * 0.1);
  x.beginPath(); x.roundRect ? x.roundRect(cx - w / 2, cy - h / 2, w, h, px * 0.25) : x.rect(cx - w / 2, cy - h / 2, w, h); x.fill(); x.stroke();
  x.fillStyle = textFarbe; zeilen.forEach((z, i) => x.fillText(z, cx, cy - h / 2 + px * 0.22 + lh * (i + 0.5)));
  x.restore(); return [cx - w / 2, cy - h / 2, w, h];
}
function wolke(x, x0, y0, x1, y1, bogen) {
  const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
  const kante = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / bogen)), dx = (bx - ax) / n, dy = (by - ay) / n;
    for (let i = 0; i < n; i++) { const sx = ax + dx * i, sy = ay + dy * i, ex = sx + dx, ey = sy + dy, mx = (sx + ex) / 2, my = (sy + ey) / 2; const nx = dy / Math.hypot(dx, dy), ny = -dx / Math.hypot(dx, dy); x.quadraticCurveTo(mx + nx * bogen * 0.75, my + ny * bogen * 0.75, ex, ey); }
  };
  x.moveTo(l, t); kante(l, t, r, t); kante(r, t, r, b); kante(r, b, l, b); kante(l, b, l, t);
}
export function markupZeichnen(x, liste, W, H, { auswahl = null } = {}) {
  for (const m of liste || []) {
    const w = sw(m, W, H), f = m.farbe || '#e5242a', pts = (m.pts || []).map(p => P(p, W, H)); if (!pts.length) continue;
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = f; x.fillStyle = f; x.lineWidth = w; x.globalAlpha = (m.deckkraft ?? 100) / 100;
    if (m.schatten !== false && m.t !== 'marker' && m.t !== 'flaeche') { x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = w * 0.9; }
    const [a, b] = [pts[0], pts[pts.length - 1]]; const fuell = (m.fuellung ?? 0) / 100;
    const fill = () => { if (fuell > 0) { x.save(); x.globalAlpha *= fuell; x.shadowBlur = 0; x.fill(); x.restore(); } };
    switch (m.t) {
      case 'pfeil': case 'doppelpfeil': {
        const kopf = w * 4.2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), e = [b[0] - Math.cos(ang) * kopf * 0.7, b[1] - Math.sin(ang) * kopf * 0.7];
        const s = m.t === 'doppelpfeil' ? [a[0] + Math.cos(ang) * kopf * 0.7, a[1] + Math.sin(ang) * kopf * 0.7] : a;
        x.beginPath(); x.moveTo(s[0], s[1]); x.lineTo(e[0], e[1]); x.stroke(); pfeilspitze(x, a, b, kopf, f); if (m.t === 'doppelpfeil') pfeilspitze(x, b, a, kopf, f);
        if (m.text) { x.shadowBlur = 0; etikett(x, m.text, a[0], a[1], w * 4.5, f); } break;
      }
      case 'linie': x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); break;
      case 'masz': {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang) * w * 3, ny = Math.cos(ang) * w * 3;
        x.lineWidth = Math.max(1, w * 0.7); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
        for (const p of [a, b]) { x.moveTo(p[0] - nx, p[1] - ny); x.lineTo(p[0] + nx, p[1] + ny); x.moveTo(p[0] - nx * 0.6 + ny * 0.4, p[1] - ny * 0.6 - nx * 0.4); x.lineTo(p[0] + nx * 0.6 - ny * 0.4, p[1] + ny * 0.6 + nx * 0.4); }
        x.stroke(); x.shadowBlur = 0; etikett(x, m.text || '', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w * 4.2, f); break;
      }
      case 'rechteck': x.beginPath(); x.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); fill(); x.stroke(); if (m.text) { x.shadowBlur = 0; etikett(x, m.text, (a[0] + b[0]) / 2, Math.min(a[1], b[1]) - w * 4, w * 4.2, f); } break;
      case 'ellipse': x.beginPath(); x.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2); fill(); x.stroke(); if (m.text) { x.shadowBlur = 0; etikett(x, m.text, (a[0] + b[0]) / 2, Math.min(a[1], b[1]) - w * 4, w * 4.2, f); } break;
      case 'wolke': x.beginPath(); wolke(x, a[0], a[1], b[0], b[1], Math.max(w * 5, Math.min(W, H) * 0.018)); fill(); x.stroke(); if (m.text) { x.shadowBlur = 0; etikett(x, m.text, (a[0] + b[0]) / 2, Math.min(a[1], b[1]) - w * 6, w * 4.2, f); } break;
      case 'flaeche': {
        x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); if (!m.offen) x.closePath();
        x.save(); x.globalAlpha *= (m.fuellung ?? 35) / 100; x.fill(); x.restore(); x.setLineDash([w * 2.2, w * 1.6]); x.stroke(); x.setLineDash([]);
        if (m.text && !m.offen) { const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length; x.shadowBlur = 0; etikett(x, m.text, cx, cy, w * 4.2, f); }
        break;
      }
      case 'frei': case 'marker': {
        if (m.t === 'marker') { x.globalAlpha *= 0.42; x.lineWidth = w * 4.5; x.lineCap = 'butt'; x.shadowBlur = 0; x.globalCompositeOperation = 'multiply'; }
        x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
        if (pts.length > 1) x.lineTo(b[0], b[1]); x.stroke(); break;
      }
      case 'nummer': {
        const r = w * 3.6; x.beginPath(); x.arc(a[0], a[1], r, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
        x.lineWidth = Math.max(1, w * 0.45); x.strokeStyle = '#fff'; x.stroke();
        x.fillStyle = hell(f) ? '#111' : '#fff'; x.font = `700 ${r * 1.15}px "Source Sans 3", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(m.nr || '?'), a[0], a[1] + r * 0.05);
        break;
      }
      case 'notiz': {
        const ziel = a, lage = pts[1] || [a[0] + W * 0.12, a[1] - H * 0.1]; x.beginPath(); x.moveTo(lage[0], lage[1]); x.lineTo(ziel[0], ziel[1]); x.lineWidth = Math.max(1, w * 0.6); x.stroke();
        x.beginPath(); x.arc(ziel[0], ziel[1], w * 1.4, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
        etikett(x, m.text || tr('Notiz'), lage[0], lage[1], w * 4.4, f, f, hell(f) ? '#111' : '#fff'); break;
      }
      case 'kreuz': { const l = Math.min(a[0], b[0]), r = Math.max(a[0], b[0]), t = Math.min(a[1], b[1]), u = Math.max(a[1], b[1]); x.lineWidth = w * 1.3; x.beginPath(); x.moveTo(l, t); x.lineTo(r, u); x.moveTo(r, t); x.lineTo(l, u); x.stroke(); break; }
      case 'haken': { const l = Math.min(a[0], b[0]), r = Math.max(a[0], b[0]), t = Math.min(a[1], b[1]), u = Math.max(a[1], b[1]); x.lineWidth = w * 1.4; x.beginPath(); x.moveTo(l, t + (u - t) * 0.55); x.lineTo(l + (r - l) * 0.38, u); x.lineTo(r, t); x.stroke(); break; }
    }
    x.restore();
    if (auswahl === m) { const bb = rahmenVon(m, W, H); x.save(); x.strokeStyle = '#fff'; x.setLineDash([5, 4]); x.lineWidth = 1.5; x.strokeRect(bb[0] - 6, bb[1] - 6, bb[2] + 12, bb[3] + 12); x.restore(); for (const p of pts) { x.save(); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.beginPath(); x.arc(p[0], p[1], 5, 0, Math.PI * 2); x.fill(); x.stroke(); x.restore(); } }
  }
}
function hell(hex) { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) > 170; }
export function rahmenVon(m, W, H) {
  const pts = (m.pts || []).map(p => P(p, W, H)); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const w = sw(m, W, H) * (m.t === 'nummer' ? 3.6 : 2);
  const l = Math.min(...xs) - w, t = Math.min(...ys) - w; return [l, t, Math.max(...xs) + w - l, Math.max(...ys) + w - t];
}
/** Treffer-Test (Pixel) */
export function markupTreffer(liste, px, py, W, H) {
  for (let i = (liste || []).length - 1; i >= 0; i--) { const [l, t, w, h] = rahmenVon(liste[i], W, H); const tol = 8; if (px >= l - tol && px <= l + w + tol && py >= t - tol && py <= t + h + tol) return liste[i]; }
  return null;
}
export const naechsteNummer = (liste) => (liste || []).filter(m => m.t === 'nummer').reduce((n, m) => Math.max(n, m.nr || 0), 0) + 1;
export const legende = (liste) => (liste || []).filter(m => m.t === 'nummer').sort((a, b) => (a.nr || 0) - (b.nr || 0)).map(m => ({ nr: m.nr, text: m.text || '', farbe: m.farbe }));
/** Legende als Streifen unter das Bild hängen */
export function legendeAnhaengen(canvas, liste, titel = '') {
  const L = legende(liste); if (!L.length && !titel) return canvas;
  const W = canvas.width, px = Math.max(14, W / 70), lh = px * 1.5; const c0 = document.createElement('canvas').getContext('2d');
  c0.font = `400 ${px}px "Source Sans 3", Arial`; const zeilen = [];
  for (const e of L) { const worte = (e.text || '–').split(/\s+/); let z = ''; const max = W - px * 4.5; const out = []; for (const w of worte) { const t = z ? z + ' ' + w : w; if (c0.measureText(t).width > max && z) { out.push(z); z = w; } else z = t; } out.push(z); zeilen.push({ e, out }); }
  const h = px * 1.4 + (titel ? lh * 1.3 : 0) + zeilen.reduce((s, z) => s + z.out.length * lh + px * 0.3, 0);
  const c = document.createElement('canvas'); c.width = W; c.height = canvas.height + h; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height); x.drawImage(canvas, 0, 0);
  let y = canvas.height + px * 0.9; x.textBaseline = 'middle';
  if (titel) { x.fillStyle = '#111'; x.font = `600 ${px * 1.15}px Oswald, Arial`; x.fillText(titel, px, y + lh * 0.4); y += lh * 1.3; }
  for (const { e, out } of zeilen) {
    x.fillStyle = e.farbe || '#e5242a'; x.beginPath(); x.arc(px * 1.6, y + lh / 2, px * 0.75, 0, Math.PI * 2); x.fill();
    x.fillStyle = hell(e.farbe || '#e5242a') ? '#111' : '#fff'; x.font = `700 ${px * 0.85}px "Source Sans 3", Arial`; x.textAlign = 'center'; x.fillText(String(e.nr), px * 1.6, y + lh / 2 + 1);
    x.textAlign = 'left'; x.fillStyle = '#222'; x.font = `400 ${px}px "Source Sans 3", Arial`; out.forEach((z, i) => x.fillText(z, px * 3.2, y + lh / 2 + i * lh)); y += out.length * lh + px * 0.3;
  }
  return c;
}
