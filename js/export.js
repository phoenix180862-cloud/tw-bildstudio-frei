// TW Bildstudio – Export (Web/Social/Druckdatei), Wasserzeichen, Ablage (PC, Drive, Baustelle, ZIP), Drucken bis DIN A0, Vorschlagsblatt
import { state, bitmap, einstSpeichern, ordner } from './store.js';
import * as E from './engine.js';
import { legendeAnhaengen, legende } from './markup.js';
import { GROESSEN, PAPIER } from './presets.js';
import * as drive from './drive.js';
import * as db from './db.js';
import { exifEinsetzen, exifDatum } from './exif.js';
import { $, $$, el, esc, toast, modal, fortschritt, dateiSpeichern, dateiname, isoDate, fmtBytes, clamp, infoPunkt } from './util.js';
import { baustelleWaehlen, driveBrowser } from './sources.js';
import { FIRMA } from './firma.js';
import { FREI } from './frei.js';
import { tr, trz, LOCALE, SPRACHE } from './i18n.js';

/** jsPDF kann mit seinen Standardschriften nur westeuropäische Zeichen (WinAnsi). Für cs/sk/uk/pl – oder wenn ein Text andere
 *  Zeichen enthält (z. B. ein polnischer Name) – wird Source Sans 3 (SIL OFL, lib/schrift-pdf, Teilmenge Latein + Kyrillisch)
 *  eingebettet und „helvetica“ darauf umgeleitet. Deutsch/Englisch mit normalen Zeichen bleibt wie bisher (Helvetica). */
let PDF_TTF = null;
const nurWinAnsi = (t) => !/[^\x00-\xff€‚„…†‡‰‹›‘’“”•–—™ŠšŽžŒœŸ]/.test(t);
async function pdfSchrift(doc, ...texte) {
  if (['de', 'en'].includes(SPRACHE) && texte.flat().every(t => nurWinAnsi(String(t ?? '')))) return doc;
  if (!PDF_TTF) PDF_TTF = Promise.all(['Regular', 'Bold'].map(async (w) => {
    const b = new Uint8Array(await (await fetch(new URL(`../lib/schrift-pdf/SourceSans3-${w}.ttf`, import.meta.url))).arrayBuffer());
    let z = ''; for (let i = 0; i < b.length; i += 0x8000) z += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(z);
  }));
  const [n, f] = await PDF_TTF;
  doc.addFileToVFS('SourceSans3-Regular.ttf', n); doc.addFont('SourceSans3-Regular.ttf', 'TWUni', 'normal');
  doc.addFileToVFS('SourceSans3-Bold.ttf', f); doc.addFont('SourceSans3-Bold.ttf', 'TWUni', 'bold');
  const alt = doc.setFont.bind(doc); doc.setFont = (name, stil, ...r) => alt(!name || /helvetica/i.test(name) ? 'TWUni' : name, stil && stil !== 'italic' ? stil : 'normal', ...r);
  doc.setFont('TWUni', 'normal'); return doc;
}
export { FIRMA };

const skripte = {};
export function ladeSkript(src) { return skripte[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete skripte[src]; rej(new Error(tr('Konnte {0} nicht laden', src))); }; document.head.append(s); }); }
const ladeBild = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/* ═════════ Wasserzeichen ═════════ */
let logoCache = null;
async function firmenlogoTransparent() {
  if (logoCache) return logoCache; const i = await ladeBild('img/tw-logo.jpg'); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height); for (let k = 0; k < d.data.length; k += 4) { const m = Math.min(d.data[k], d.data[k + 1], d.data[k + 2]); if (m > 225) d.data[k + 3] = Math.max(0, 255 - (m - 225) * 8.5); }
  x.putImageData(d, 0, 0); logoCache = c; return c;
}
async function logoBild(wz) { if (FREI) return wz.logo && wz.logo !== 'firma' ? ladeBild(wz.logo) : null; if (wz.logo === 'firma' || !wz.logo) return firmenlogoTransparent(); return ladeBild(wz.logo); }
export async function wasserzeichen(canvas, wz) {
  if (!wz?.an) return canvas; const W = canvas.width, H = canvas.height, x = canvas.getContext('2d'), kurz = Math.min(W, H);
  const rand = (wz.rand ?? 3) / 100 * kurz, a = (wz.deckkraft ?? 70) / 100;
  x.save(); x.globalAlpha = a;
  const textMasse = () => { const px = Math.max(10, (wz.groesse ?? 4) / 100 * kurz); x.font = `600 ${px}px "${wz.schrift || 'Oswald'}", Arial, sans-serif`; return { px, w: x.measureText(wz.text || '').width }; };
  let teile = [];
  if (wz.art !== 'logo' && wz.text) { const m = textMasse(); teile.push({ typ: 'text', w: m.w, h: m.px * 1.2, px: m.px }); }
  if (wz.art !== 'text') { const lg = await logoBild(wz); if (lg) { const lw = (wz.groesse ?? 4) / 100 * kurz * 4.2, lh = lw * lg.height / lg.width; teile.unshift({ typ: 'logo', img: lg, w: lw, h: lh }); } }
  if (!teile.length) { x.restore(); return canvas; }
  const gw = Math.max(...teile.map(t => t.w)), gh = teile.reduce((s, t) => s + t.h, 0) + (teile.length - 1) * kurz * 0.008;
  const zeichneBlock = (cx, cy) => {
    let y = cy - gh / 2;
    for (const t of teile) {
      if (t.typ === 'logo') x.drawImage(t.img, cx - t.w / 2, y, t.w, t.h);
      else { x.font = `600 ${t.px}px "${wz.schrift || 'Oswald'}", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; if (wz.schatten) { x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = t.px * 0.25; } x.fillStyle = wz.farbe || '#fff'; x.fillText(wz.text, cx, y + t.h / 2); x.shadowBlur = 0; }
      y += t.h + kurz * 0.008;
    }
  };
  if (wz.kachel) { x.translate(W / 2, H / 2); x.rotate(-Math.PI / 6); const sx = gw * 1.8, sy = gh * 3.2; for (let yy = -H; yy < H; yy += sy) for (let xx = -W; xx < W; xx += sx) zeichneBlock(xx + ((Math.round(yy / sy) & 1) ? sx / 2 : 0), yy); }
  else {
    const p = wz.pos || 'ur'; const cx = p[1] === 'l' ? rand + gw / 2 : p[1] === 'r' ? W - rand - gw / 2 : W / 2; const cy = p[0] === 'o' ? rand + gh / 2 : p[0] === 'u' ? H - rand - gh / 2 : H / 2;
    zeichneBlock(cx, cy);
  }
  x.restore(); return canvas;
}
export async function wasserzeichenDialog(beispielId) {
  const wz = JSON.parse(JSON.stringify(state.einst.wz)); const vor = el('canvas', { style: 'width:100%;border-radius:8px;background:#000' });
  let basis = null; try { const r = state.recs.get(beispielId) || [...state.recs.values()][0]; if (r) { const b = await bitmap(r); basis = E.rendern(b, r.id, r.edit, { maxW: 700, maxH: 500 }); } } catch (e) { }
  const neu = async () => { if (!basis) return; vor.width = basis.width; vor.height = basis.height; const c = document.createElement('canvas'); c.width = basis.width; c.height = basis.height; c.getContext('2d').drawImage(basis, 0, 0); await wasserzeichen(c, { ...wz, an: true }); vor.getContext('2d').drawImage(c, 0, 0); };
  const feld = (label, inp) => el('div', {}, el('label', { class: 'lbl' }, label), inp);
  const pos = el('div', { style: 'display:grid;grid-template-columns:repeat(3,34px);gap:3px' }, ...['ol', 'om', 'or', 'ml', 'mm', 'mr', 'ul', 'um', 'ur'].map(p => el('button', { class: 'btn klein' + (wz.pos === p ? ' an' : ''), style: 'height:30px', onclick: (e) => { wz.pos = p; wz.kachel = false; $$('button', pos).forEach(b => b.classList.remove('an')); e.target.classList.add('an'); neu(); } }, '•')));
  const logoWahl = el('input', { type: 'file', accept: 'image/png,image/svg+xml,image/webp', style: 'display:none', onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { wz.logo = r.result; neu(); }; r.readAsDataURL(f); } });
  const inhalt = el('div', { class: 'spalten' },
    el('div', {}, vor, el('p', { class: 'hinweis' }, tr('Vorschau am Beispielbild. Das Wasserzeichen kommt nur in die exportierten/gedruckten Dateien – deine Bearbeitung bleibt sauber.'))),
    el('div', {},
      feld(tr('Art'), el('select', { class: 'inp', onchange: (e) => { wz.art = e.target.value; neu(); } }, ...[['text', tr('Text')], ['logo', tr('Logo')], ['beides', tr('Logo + Text')]].map(([v, t]) => el('option', { value: v, selected: wz.art === v }, t)))),
      feld(tr('Text'), el('input', { class: 'inp', style: 'width:100%', value: wz.text, placeholder: FREI ? tr('z. B. © Max Mustermann') : '', oninput: (e) => { wz.text = e.target.value; neu(); } })),
      FREI ? feld(tr('Logo'), el('div', { class: 'zeile' }, el('button', { class: 'btn klein' + (wz.logo && wz.logo !== 'firma' ? ' an' : ''), onclick: () => logoWahl.click() }, wz.logo && wz.logo !== 'firma' ? tr('Anderes Logo (PNG) …') : tr('Eigenes Logo (PNG) …')), wz.logo && wz.logo !== 'firma' ? el('button', { class: 'btn klein', onclick: (e) => { wz.logo = null; e.target.previousSibling.classList.remove('an'); neu(); } }, tr('Logo entfernen')) : null, logoWahl))
        : feld(tr('Logo'), el('div', { class: 'zeile' }, el('button', { class: 'btn klein' + (!wz.logo || wz.logo === 'firma' ? ' an' : ''), onclick: () => { wz.logo = 'firma'; neu(); } }, tr('TW-Firmenlogo')), el('button', { class: 'btn klein', onclick: () => logoWahl.click() }, tr('Eigenes (PNG) …')), logoWahl)),
      el('div', { class: 'zeile' }, feld(tr('Position'), pos), el('div', {}, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: wz.kachel, onchange: (e) => { wz.kachel = e.target.checked; neu(); } }), tr('Über das ganze Bild (Kachel, gegen Kopieren)')), el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: wz.schatten, onchange: (e) => { wz.schatten = e.target.checked; neu(); } }), tr('Schatten')))),
      feld(tr('Größe'), el('input', { type: 'range', min: 1.5, max: 14, step: 0.5, value: wz.groesse, oninput: (e) => { wz.groesse = +e.target.value; neu(); } })),
      feld(tr('Deckkraft'), el('input', { type: 'range', min: 10, max: 100, value: wz.deckkraft, oninput: (e) => { wz.deckkraft = +e.target.value; neu(); } })),
      feld(tr('Abstand zum Rand'), el('input', { type: 'range', min: 0, max: 10, step: 0.5, value: wz.rand, oninput: (e) => { wz.rand = +e.target.value; neu(); } })),
      el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Farbe')), el('input', { type: 'color', value: wz.farbe, oninput: (e) => { wz.farbe = e.target.value; neu(); } }),
        el('select', { class: 'inp', onchange: (e) => { wz.schrift = e.target.value; neu(); } }, ...E.SCHRIFTEN.map(f => el('option', { value: f, selected: wz.schrift === f }, f))))));
  setTimeout(neu, 50);
  const ok = await modal({ titel: tr('Wasserzeichen'), inhalt, breit: true, hilfe: 'wasserzeichen', knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Übernehmen'), art: 'primaer', wert: true }] });
  if (ok) { wz.an = true; state.einst.wz = wz; await einstSpeichern(); } return ok;
}

/* ═════════ Bild für Export erzeugen ═════════ */
export const EXPORT_DEFAULT = { groesse: 'web2048', eigenW: 1200, eigenH: 800, einpassen: 'zuschneiden', fuellFarbe: '#ffffff', fuellUnscharf: true, format: 'jpeg', qualitaet: 88, maxKB: 0, muster: '{name}', web: false, wz: false, legende: false, metadaten: true, unterordner: true };
function zielMasse(o) {
  const g = GROESSEN.find(x => x.id === o.groesse) || GROESSEN[0];
  if (g.eigen) return { w: +o.eigenW || 1200, h: +o.eigenH || 800, exakt: true };
  if (g.lang) return { lang: g.lang }; if (g.w) return { w: g.w, h: g.h, exakt: true }; return {};
}
async function kodieren(c, o) {
  const typ = o.format === 'png' ? 'image/png' : o.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = (q) => new Promise(r => c.toBlob(r, typ, q));
  if (typ === 'image/png') return blob();
  let q = (o.qualitaet || 88) / 100, b = await blob(q);
  if (o.maxKB > 0 && b.size > o.maxKB * 1024) { let lo = 0.35, hi = q; for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; const t = await blob(m); if (t.size > o.maxKB * 1024) hi = m; else { lo = m; b = t; } } if (b.size > o.maxKB * 1024) b = await blob(lo); }
  return b;
}
/** fertiges Bild als Canvas (alle Bearbeitungen, Größe, Wasserzeichen, Legende) */
export async function exportCanvas(rec, o, extraMax) {
  const bmp = await bitmap(rec); const m = zielMasse(o);
  let maxW = Infinity, maxH = Infinity;
  if (m.lang) { maxW = maxH = m.lang; } else if (m.exakt) { const vb = Math.max(m.w, m.h) * 1.15; maxW = maxH = Math.max(vb, 1); if (o.einpassen === 'zuschneiden') maxW = maxH = Math.max(m.w, m.h) * 2.2; }
  if (extraMax) { maxW = Math.min(maxW, extraMax); maxH = Math.min(maxH, extraMax); }
  let c = E.rendern(bmp, rec.id, rec.edit, { maxW, maxH });
  if (m.exakt) c = aufFormat(c, m.w, m.h, o);
  if (o.legende && legende(rec.edit?.markup).length) c = legendeAnhaengen(c, rec.edit.markup);
  if (o.wz) { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); c = await wasserzeichen(k, { ...state.einst.wz, an: true }); }
  return c;
}
function aufFormat(src, W, H, o) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  const rs = src.width / src.height, rz = W / H;
  if (o.einpassen === 'zuschneiden') { let sw = src.width, sh = src.height, sx = 0, sy = 0; if (rs > rz) { sw = sh * rz; sx = (src.width - sw) / 2; } else { sh = sw / rz; sy = (src.height - sh) / 2; } schrittweise(x, src, sx, sy, sw, sh, 0, 0, W, H); }
  else {
    if (o.fuellUnscharf) { x.filter = `blur(${Math.round(Math.max(W, H) / 30)}px) brightness(.8)`; const k = Math.max(W / src.width, H / src.height) * 1.1; x.drawImage(src, (W - src.width * k) / 2, (H - src.height * k) / 2, src.width * k, src.height * k); x.filter = 'none'; }
    else { x.fillStyle = o.fuellFarbe || '#fff'; x.fillRect(0, 0, W, H); }
    const k = Math.min(W / src.width, H / src.height); const w = src.width * k, h = src.height * k; schrittweise(x, src, 0, 0, src.width, src.height, (W - w) / 2, (H - h) / 2, w, h);
  }
  return c;
}
/** hochwertiges Verkleinern in Schritten (gegen Treppen/Flimmern) */
function schrittweise(x, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  let quelle = src, qx = sx, qy = sy, qw = sw, qh = sh;
  while (qw / dw > 2.2) { const t = document.createElement('canvas'); t.width = Math.round(qw / 2); t.height = Math.round(qh / 2); const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(quelle, qx, qy, qw, qh, 0, 0, t.width, t.height); quelle = t; qx = 0; qy = 0; qw = t.width; qh = t.height; }
  x.drawImage(quelle, qx, qy, qw, qh, dx, dy, dw, dh);
}
export function ausgabeName(rec, o, nr, ext) {
  const d = new Date(rec.aufnahme || Date.now()); const basis = rec.name.replace(/\.[^.]+$/, '');
  let n = (o.muster || '{name}').replace(/\{name\}/g, basis).replace(/\{ordner\}/g, ordner(rec.ordner)?.name || tr('Bilder')).replace(/\{datum\}/g, isoDate(d)).replace(/\{nr\}/g, String(nr).padStart(3, '0'))
    .replace(/\{baustelle\}/g, rec.quelleInfo?.baustelle || state.einst.letzteBaustelle?.name || '').replace(/\{titel\}/g, rec.titel || basis);
  return dateiname(n, o.web) + '.' + ext;
}
/** Datei (Blob) für ein Bild erzeugen */
export async function exportDatei(rec, o, nr = 1) {
  const c = await exportCanvas(rec, o); let blob = await kodieren(c, o);
  if (o.metadaten && blob.type === 'image/jpeg') blob = await exifEinsetzen(blob, { urheber: state.einst.urheber, copyright: state.einst.copyright, beschreibung: (rec.ki && !/KI/.test(rec.titel || '') ? tr('KI-bearbeitet. ') : '') + (rec.titel || ''), software: rec.ki ? tr('TW Bildstudio (KI: {0})', rec.ki.modell || '') : 'TW Bildstudio', datum: exifDatum(rec.aufnahme) });
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob, name: ausgabeName(rec, o, nr, ext), w: c.width, h: c.height };
}

/* ═════════ Export-Dialog ═════════ */
const VORGABEN = [
  { id: 'web', ico: '🌐', name: tr('Webseite / Referenz'), o: { groesse: 'web2048', format: 'jpeg', qualitaet: 84, maxKB: 600, web: true, muster: FREI ? '{titel}-{nr}' : '{baustelle}-{titel}-{nr}', wz: false } },
  { id: 'insta', ico: '📸', name: tr('Instagram (4:5)'), o: { groesse: 'ig-hoch', einpassen: 'zuschneiden', format: 'jpeg', qualitaet: 90, maxKB: 0, wz: false } },
  { id: 'fb', ico: '👍', name: 'Facebook', o: { groesse: 'fb-beitrag', einpassen: 'auffuellen', fuellUnscharf: true, format: 'jpeg', qualitaet: 88, wz: true } },
  { id: 'mail', ico: '✉', name: tr('E-Mail / WhatsApp'), o: { groesse: 'mail', format: 'jpeg', qualitaet: 82, maxKB: 450, wz: false } },
  { id: 'kunde', ico: '🏗', name: tr('Kunde / Bauherr'), o: { groesse: 'web2048', format: 'jpeg', qualitaet: 88, legende: true, wz: true } },
  { id: 'voll', ico: '🖼', name: tr('Volle Qualität'), o: { groesse: 'orig', format: 'jpeg', qualitaet: 95, maxKB: 0, wz: false } }
];
export async function exportDialog(ids, vorgabeZiel = null) {
  ids = (ids || []).filter(id => state.recs.has(id)); if (!ids.length) { toast(tr('Bitte zuerst Bilder auswählen.'), 'warn'); return; }
  const o = { ...EXPORT_DEFAULT, ...(state.einst.letzterExport || {}) }; let ziel = vorgabeZiel || o.ziel || 'pc';
  if (FREI && (ziel === 'baustelle' || ziel === 'drive')) ziel = 'pc';
  const box = el('div', { class: 'spalten' }); const vor = el('div', { class: 'hinweis', style: 'margin-top:8px' });
  const zeichne = () => {
    box.innerHTML = ''; const set = (k, v, neu) => { o[k] = v; if (neu) zeichne(); else info(); };
    const g = GROESSEN.find(x => x.id === o.groesse) || GROESSEN[0]; const gruppen = [...new Set(GROESSEN.map(x => x.gruppe))];
    const links = el('div', {},
      el('label', { class: 'lbl' }, tr('Schnellvorgaben')),
      el('div', { class: 'karten', style: 'grid-template-columns:repeat(3,1fr)' }, ...[...VORGABEN, ...(state.einst.exportVorgaben || [])].map(v => el('button', { class: 'karte', onclick: () => { Object.assign(o, v.o); zeichne(); } }, el('span', { class: 'ico' }, v.ico || '★'), el('b', {}, v.name)))),
      el('label', { class: 'lbl' }, tr('Größe')),
      el('select', { class: 'inp', style: 'width:100%', onchange: (e) => set('groesse', e.target.value, true) }, ...gruppen.map(gr => { const og = el('optgroup', { label: gr }); GROESSEN.filter(x => x.gruppe === gr).forEach(x => og.append(el('option', { value: x.id, selected: x.id === o.groesse }, x.name))); return og; })),
      g.eigen ? el('div', { class: 'zeile', style: 'margin-top:6px' }, el('input', { class: 'inp', type: 'number', value: o.eigenW, style: 'width:90px', oninput: (e) => set('eigenW', +e.target.value) }), '×', el('input', { class: 'inp', type: 'number', value: o.eigenH, style: 'width:90px', oninput: (e) => set('eigenH', +e.target.value) }), tr('Pixel')) : null,
      g.w || g.eigen ? el('div', {}, el('label', { class: 'lbl' }, tr('Wenn das Seitenverhältnis nicht passt')), el('div', { class: 'tabs' },
        el('button', { class: o.einpassen === 'zuschneiden' ? 'an' : '', onclick: () => set('einpassen', 'zuschneiden', true) }, tr('Mitte zuschneiden')), el('button', { class: o.einpassen === 'auffuellen' ? 'an' : '', onclick: () => set('einpassen', 'auffuellen', true) }, tr('Rand auffüllen'))),
        o.einpassen === 'auffuellen' ? el('div', { class: 'zeile' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.fuellUnscharf, onchange: (e) => set('fuellUnscharf', e.target.checked) }), tr('unscharfer Bildhintergrund')), el('span', { class: 'hinweis' }, tr('oder Farbe')), el('input', { type: 'color', value: o.fuellFarbe, oninput: (e) => set('fuellFarbe', e.target.value) })) : null) : null,
      el('label', { class: 'lbl' }, tr('Dateiformat')),
      el('div', { class: 'tabs' }, ...[['jpeg', 'JPG'], ['webp', tr('WebP (Web, klein)')], ['png', tr('PNG (verlustfrei)')]].map(([v, t]) => el('button', { class: o.format === v ? 'an' : '', onclick: () => set('format', v, true) }, t))),
      o.format !== 'png' ? el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Qualität')), el('input', { type: 'range', min: 40, max: 100, value: o.qualitaet, style: 'flex:1', oninput: (e) => { set('qualitaet', +e.target.value); e.target.nextSibling.textContent = e.target.value; } }), el('b', {}, o.qualitaet),
        el('span', { class: 'hinweis' }, tr('max. KB')), el('input', { class: 'inp', type: 'number', min: 0, step: 50, value: o.maxKB || '', placeholder: tr('egal'), style: 'width:80px', oninput: (e) => set('maxKB', +e.target.value || 0) }), infoPunkt(tr('Viele Webseiten und Portale haben eine Größengrenze (z. B. 500 KB). Die Qualität wird dann automatisch so weit gesenkt, dass die Datei darunter bleibt.'))) : null,
      el('label', { class: 'lbl' }, tr('Dateiname')), el('input', { class: 'inp', style: 'width:100%', value: o.muster, oninput: (e) => set('muster', e.target.value) }),
      el('div', { class: 'hinweis' }, FREI ? tr('Platzhalter: {name} {titel} {ordner} {datum} {nr}') : tr('Platzhalter: {name} {titel} {ordner} {baustelle} {datum} {nr}')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.web, onchange: (e) => set('web', e.target.checked) }), FREI ? tr('web-tauglich (klein, ohne Umlaute/Leerzeichen – gut für Suchmaschinen)') : tr('web-tauglich (klein, ohne Umlaute/Leerzeichen – gut für Google)')));
    const rechts = el('div', {},
      el('label', { class: 'lbl' }, tr('Extras')),
      el('div', { class: 'zeile' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.wz, onchange: (e) => set('wz', e.target.checked) }), tr('Wasserzeichen')), el('button', { class: 'btn klein', onclick: async () => { if (await wasserzeichenDialog(ids[0])) { o.wz = true; zeichne(); } } }, tr('einstellen …'))),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.legende, onchange: (e) => set('legende', e.target.checked) }), tr('Legende der nummerierten Punkte unter das Bild')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.metadaten, onchange: (e) => set('metadaten', e.target.checked) }), tr('Urheber & Copyright in die Datei schreiben')),
      el('div', { class: 'hinweis' }, tr('Standortdaten (GPS) aus Handyfotos werden beim Export immer entfernt.')),
      el('label', { class: 'lbl' }, tr('Wohin?')),
      el('div', { class: 'karten', style: 'grid-template-columns:1fr 1fr' }, ...(FREI ? [
        ['pc', '💻', tr('Ordner auf dem PC'), tr('direkt in den Explorer')], ['zip', '🗜', tr('ZIP-Datei'), tr('alles in einer Datei')],
        ['einzeln', '⬇', tr('Herunterladen'), tr('in „Downloads“')], ['versand', '📤', tr('Teilen'), tr('WhatsApp, Mail-Programm …')]
      ] : [
        ['pc', '💻', tr('Ordner auf dem PC'), tr('direkt in den Explorer')], ['baustelle', '🏗', tr('Baustelle'), tr('05_Bilder in Drive')], ['drive', '☁', tr('Google Drive'), tr('beliebiger Ordner')],
        ['zip', '🗜', tr('ZIP-Datei'), tr('alles in einer Datei')], ['einzeln', '⬇', tr('Herunterladen'), tr('in „Downloads“')], ['versand', '✉', tr('Versenden'), tr('Mail, WhatsApp, Baustellen-App')]
      ]).map(([k, i, t, s]) => el('button', { class: 'karte' + (ziel === k ? ' an' : ''), onclick: () => { ziel = k; zeichne(); } }, el('span', { class: 'ico' }, i), el('b', {}, t), el('small', {}, s)))),
      ziel === 'pc' || ziel === 'zip' || ziel === 'drive' || ziel === 'baustelle' ? el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.unterordner, onchange: (e) => set('unterordner', e.target.checked) }), tr('Unterordner nach Bildstudio-Ordnern anlegen')) : null,
      vor);
    box.append(links, rechts); info();
  };
  const info = () => { const r = state.recs.get(ids[0]); const m = zielMasse(o); vor.textContent = trz(ids.length, '{0} Bild', '{0} Bilder') + ' · ' + (m.exakt ? tr('{0}×{1} px', m.w, m.h) : m.lang ? tr('lange Seite {0} px', m.lang) : tr('Originalgröße')) + ` · ${o.format.toUpperCase()}` + (r ? ' · ' + tr('Beispiel: {0}', ausgabeName(r, o, 1, o.format === 'jpeg' ? 'jpg' : o.format)) : ''); };
  zeichne();
  const los = await modal({ titel: tr('Exportieren ({0})', ids.length), inhalt: box, breit: true, hilfe: 'export', knoepfe: [
    { text: tr('★ als Vorgabe merken'), art: 'links', wert: 'merken' }, { text: tr('Abbrechen'), wert: null }, { text: tr('⇪ Exportieren'), art: 'primaer', wert: 'los' }] });
  if (los === 'merken') { const { eingabe } = await import('./util.js'); const n = await eingabe(tr('Export-Vorgabe speichern'), '', tr('Name (z. B. „Homepage Galerie“)')); if (n) { state.einst.exportVorgaben = [...(state.einst.exportVorgaben || []), { id: 'v' + Date.now(), name: n, ico: '★', o: { ...o } }]; await einstSpeichern(); } return exportDialog(ids, ziel); }
  if (los !== 'los') return;
  state.einst.letzterExport = { ...o, ziel }; einstSpeichern();
  if (ziel === 'versand') { const v = await import('./versand.js'); return v.versandDialog(ids, o); }
  return exportieren(ids, o, ziel);
}
export async function exportieren(ids, o, ziel) {
  if (FREI && (ziel === 'baustelle' || ziel === 'drive')) ziel = 'einzeln';
  const recs = ids.map(id => state.recs.get(id)).filter(Boolean);
  const unter = (r) => o.unterordner && r.ordner ? dateiname(ordner(r.ordner)?.name || '') : '';
  let ablegen, fertig = () => { }, zielText = '';
  try {
    if (ziel === 'pc') {
      if (!('showDirectoryPicker' in window)) { toast(tr('Ordnerauswahl geht nur in Chrome/Edge am PC – ich lade stattdessen herunter.'), 'warn'); return exportieren(ids, o, 'einzeln'); }
      let h = await db.get('kv', 'exportOrdner'); let neu = !h;
      if (h) { const nochmal = await modal({ titel: tr('Zielordner'), inhalt: el('p', {}, tr('Wieder in „{0}“ speichern?', h.name)), knoepfe: [{ text: tr('Anderen Ordner …'), wert: 'anders' }, { text: tr('In „{0}“', h.name), art: 'primaer', wert: 'gleich' }] }); if (!nochmal) return; neu = nochmal === 'anders'; }
      if (neu) { h = await showDirectoryPicker({ id: 'bs-export', mode: 'readwrite', startIn: 'pictures' }); await db.put('kv', 'exportOrdner', h); }
      if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') { toast(tr('Kein Schreibzugriff auf den Ordner.'), 'warn'); return; }
      zielText = h.name;
      ablegen = async (r, d) => { let dir = h; const u = unter(r); if (u) dir = await h.getDirectoryHandle(u, { create: true }); let name = d.name; for (let k = 2; k < 999; k++) { try { await dir.getFileHandle(name); name = d.name.replace(/(\.[^.]+)$/, `_${k}$1`); } catch (e) { break; } } const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(d.blob); await w.close(); };
    } else if (ziel === 'baustelle' || ziel === 'drive') {
      await drive.sicher();
      let wurzel;
      if (ziel === 'baustelle') {
        const vorschlag = recs.find(r => r.quelleInfo?.baustelleId)?.quelleInfo; let b = vorschlag ? { id: vorschlag.baustelleId, name: vorschlag.baustelle } : null;
        if (b) { const w = await modal({ titel: tr('Baustelle'), inhalt: el('p', {}, tr('In die Baustelle „{0}“ (05_Bilder) ablegen?', b.name)), knoepfe: [{ text: tr('Andere Baustelle …'), wert: 'anders' }, { text: tr('Ja, dorthin'), art: 'primaer', wert: 'ja' }] }); if (!w) return; if (w === 'anders') b = null; }
        if (!b) b = await baustelleWaehlen(tr('Bilder ablegen in Baustelle …')); if (!b) return;
        wurzel = await drive.baustellenBilderOrdner(b.id); zielText = tr('{0} › 05_Bilder', b.name);
        for (const r of recs) if (!r.quelleInfo?.baustelleId) { r.quelleInfo = { ...(r.quelleInfo || {}), baustelle: b.name, baustelleId: b.id }; }
      } else { const f = await driveBrowser({ modus: 'ordner', titel: tr('Zielordner in Google Drive') }); if (!f) return; wurzel = f.id; zielText = f.pfad; }
      const cache = {};
      ablegen = async (r, d) => { let pid = wurzel; const u = unter(r); if (u) pid = cache[u] ||= await drive.ordnerSichern(wurzel, u); await drive.hochladen(d.blob, d.name, pid, r.titel || ''); };
    } else if (ziel === 'zip') {
      await ladeSkript('lib/jszip.min.js'); const zip = new window.JSZip(); const genutzt = new Set();
      ablegen = async (r, d) => { const u = unter(r); let p = (u ? u + '/' : '') + d.name; for (let k = 2; genutzt.has(p); k++) p = (u ? u + '/' : '') + d.name.replace(/(\.[^.]+)$/, `_${k}$1`); genutzt.add(p); zip.file(p, d.blob); };
      fertig = async () => { const b = await zip.generateAsync({ type: 'blob' }); dateiSpeichern(b, tr('Bilder_{0}.zip', isoDate())); };
      zielText = tr('ZIP-Datei');
    } else { ablegen = async (r, d) => { dateiSpeichern(d.blob, d.name); await new Promise(res => setTimeout(res, 350)); }; zielText = tr('Downloads'); }
  } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'fehler', 6000); return; }
  const p = fortschritt(tr('Exportieren')); let ok = 0, groesse = 0; const fehler = [];
  for (let i = 0; i < recs.length; i++) {
    if (p.abgebrochen) break; const r = recs[i]; p.set(i, recs.length, `${i + 1} / ${recs.length}: ${r.name}`);
    try { const d = await exportDatei(r, o, i + 1); await ablegen(r, d); ok++; groesse += d.blob.size; } catch (e) { console.error(e); fehler.push(r.name + ': ' + e.message); }
  }
  p.set(1, 1, tr('fertig …')); try { await fertig(); } catch (e) { fehler.push(e.message); } p.zu();
  if (ziel === 'baustelle') { const { recsSpeichern } = await import('./store.js'); recsSpeichern(recs); }
  toast(trz(ok, '{0} Bild exportiert → {1} ({2})', '{0} Bilder exportiert → {1} ({2})').replace('{1}', zielText).replace('{2}', fmtBytes(groesse)) + (fehler.length ? tr(' · {0} Fehler', fehler.length) : ''), fehler.length ? 'warn' : 'ok', 6000);
  if (fehler.length) console.warn(fehler);
}

/* ═════════ Drucken bis DIN A0 ═════════ */
const MM = 25.4;
export async function druckDialog(ids) {
  ids = (ids || []).filter(id => state.recs.has(id)); if (!ids.length) { toast(tr('Bitte zuerst Bilder auswählen.'), 'warn'); return; }
  const o = { papier: 'A4', w: 400, h: 300, ausrichtung: 'auto', modus: 'einpassen', rand: 10, dpi: 200, unterschrift: false, legende: true, wz: false, proSeite: 1, poster: false, posterPapier: 'A4', ...(state.einst.letzterDruck || {}) };
  const recs = ids.map(id => state.recs.get(id)); const erste = recs[0];
  const vorBox = el('div', { class: 'dr-vor' }), seite = el('div'); const box = el('div', { class: 'dr' }, vorBox, seite);
  let bildVor = null; try { const b = await bitmap(erste); bildVor = E.rendern(b, erste.id, erste.edit, { maxW: 900, maxH: 900 }); } catch (e) { }
  const papier = () => { const p = PAPIER.find(x => x.id === o.papier) || PAPIER[4]; let w = p.id === 'eigen' ? +o.w : p.w, h = p.id === 'eigen' ? +o.h : p.h; const quer = o.ausrichtung === 'quer' || (o.ausrichtung === 'auto' && bildVor && bildVor.width > bildVor.height && o.proSeite === 1); if (quer !== (w > h)) [w, h] = [h, w]; return { w, h, name: p.id === 'eigen' ? tr('{0}×{1} mm', w, h) : p.name }; };
  const zeichne = () => {
    seite.innerHTML = ''; const set = (k, v) => { o[k] = v; zeichne(); };
    const pa = papier(); const bildMm = platz(pa, o, bildVor);
    const pxNoetig = Math.round(Math.max(bildMm.w, bildMm.h) / MM * o.dpi); const pxDa = erste ? Math.max(E.ausgabeGroesse(E.normalisiereBearbeitung(erste.edit).geo, erste.w, erste.h).w, E.ausgabeGroesse(E.normalisiereBearbeitung(erste.edit).geo, erste.w, erste.h).h) : 0;
    const effDpi = Math.round(pxDa / (Math.max(bildMm.w, bildMm.h) / MM)); const ampel = effDpi >= 200 ? ['gruen', tr('Sehr gut – scharf aus der Nähe')] : effDpi >= 110 ? ['gelb', tr('Gut für Poster mit etwas Abstand')] : ['rot', tr('Wenig Auflösung – wird hochgerechnet, aus der Nähe weich')];
    seite.append(
      el('label', { class: 'lbl' }, tr('Papierformat')),
      el('select', { class: 'inp', style: 'width:100%', onchange: (e) => set('papier', e.target.value) }, ...PAPIER.map(p => el('option', { value: p.id, selected: p.id === o.papier }, p.id === 'eigen' ? p.name : tr('{0} – {1}×{2} mm', p.name, p.w, p.h)))),
      o.papier === 'eigen' ? el('div', { class: 'zeile', style: 'margin-top:6px' }, el('input', { class: 'inp', type: 'number', value: o.w, style: 'width:80px', onchange: (e) => set('w', +e.target.value) }), '×', el('input', { class: 'inp', type: 'number', value: o.h, style: 'width:80px', onchange: (e) => set('h', +e.target.value) }), 'mm') : null,
      el('label', { class: 'lbl' }, tr('Ausrichtung')), el('div', { class: 'tabs' }, ...[['auto', tr('Automatisch')], ['hoch', tr('Hochformat')], ['quer', tr('Querformat')]].map(([v, t]) => el('button', { class: o.ausrichtung === v ? 'an' : '', onclick: () => set('ausrichtung', v) }, t))),
      el('label', { class: 'lbl' }, tr('Bild auf dem Blatt')), el('div', { class: 'tabs' }, ...[['einpassen', tr('Ganz zeigen')], ['fuellen', tr('Blatt füllen (beschneiden)')]].map(([v, t]) => el('button', { class: o.modus === v ? 'an' : '', onclick: () => set('modus', v) }, t))),
      el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Rand')), el('input', { type: 'range', min: 0, max: 40, value: o.rand, style: 'flex:1', oninput: (e) => { o.rand = +e.target.value; e.target.nextSibling.textContent = o.rand + ' mm'; }, onchange: () => zeichne() }), el('b', {}, o.rand + ' mm')),
      ids.length > 1 ? el('div', {}, el('label', { class: 'lbl' }, tr('Bilder pro Blatt')), el('div', { class: 'tabs' }, ...[1, 2, 4, 6, 9, 12].map(n => el('button', { class: o.proSeite === n ? 'an' : '', onclick: () => set('proSeite', n) }, n === 1 ? 'je 1' : n)))) : null,
      el('label', { class: 'lbl' }, tr('Druckauflösung')), el('div', { class: 'tabs' }, ...[[150, tr('150 dpi (Poster)')], [200, '200 dpi'], [300, tr('300 dpi (Foto)')]].map(([v, t]) => el('button', { class: o.dpi === v ? 'an' : '', onclick: () => set('dpi', v) }, t))),
      el('div', { style: 'margin:8px 0' }, el('span', { class: 'ampel ' + ampel[0] }, tr('● {0} dpi', effDpi)), ' ', el('span', { class: 'hinweis' }, ampel[1])),
      el('div', { class: 'hinweis' }, tr('Bildgröße auf dem Blatt: {0} × {1} mm · benötigt {2} px, vorhanden {3} px', Math.round(bildMm.w), Math.round(bildMm.h), pxNoetig, pxDa) + (pxDa < pxNoetig ? tr(' → wird sauber hochgerechnet und nachgeschärft') : '')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.unterschrift, onchange: (e) => set('unterschrift', e.target.checked) }), tr('Bildunterschrift (Titel bzw. Dateiname, Datum)')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.legende, onchange: (e) => set('legende', e.target.checked) }), tr('Legende der nummerierten Punkte mitdrucken')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.wz, onchange: (e) => set('wz', e.target.checked) }), tr('Wasserzeichen')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.poster, onchange: (e) => set('poster', e.target.checked) }), tr('Posterdruck: auf mehrere kleine Blätter verteilen')),
      o.poster ? el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Drucker-Papier')), el('select', { class: 'inp', onchange: (e) => set('posterPapier', e.target.value) }, ...['A4', 'A3'].map(p => el('option', { value: p, selected: o.posterPapier === p }, p))), el('span', { class: 'hinweis' }, tr('→ {0} Blätter, mit 10 mm Überlappung und Klebemarken', posterKacheln(pa, o).n))) : null);
    vorschau(pa);
  };
  const vorschau = (pa) => {
    vorBox.innerHTML = ''; const maxW = Math.max(200, vorBox.clientWidth - 40 || 520), maxH = Math.max(240, vorBox.clientHeight - 40 || 520); const k = Math.min(maxW / pa.w, maxH / pa.h);
    const blatt = el('div', { class: 'papier', style: { width: pa.w * k + 'px', height: pa.h * k + 'px' } }); vorBox.append(blatt, el('div', { style: 'position:absolute;bottom:8px;left:12px;color:#ccc;font-size:12px' }, pa.name + tr(' · {0}×{1} mm', pa.w, pa.h)));
    const n = ids.length > 1 ? o.proSeite : 1; const zellen = raster(pa, o, n);
    zellen.forEach((z, i) => { const r = recs[i]; if (!r) return; const c = el('canvas'); blatt.append(c); (async () => { const b = await bitmap(r); const img = E.rendern(b, r.id, r.edit, { maxW: 500, maxH: 500 }); const pl = einpassen(z, img.width / img.height, o.modus); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); Object.assign(c.style, { left: pl.x * k + 'px', top: pl.y * k + 'px', width: pl.w * k + 'px', height: pl.h * k + 'px', objectFit: 'cover' }); if (o.modus === 'fuellen') { c.style.clipPath = `inset(${Math.max(0, z.y - pl.y) * k}px ${Math.max(0, pl.x + pl.w - z.x - z.w) * k}px ${Math.max(0, pl.y + pl.h - z.y - z.h) * k}px ${Math.max(0, z.x - pl.x) * k}px)`; } })(); });
    if (o.poster) { const t = posterKacheln(pa, o); const svg = `<svg class="kachelnetz" viewBox="0 0 ${pa.w} ${pa.h}" preserveAspectRatio="none">${t.kacheln.map(q => `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none" stroke="#c41e1e" stroke-width="${pa.w / 300}" stroke-dasharray="${pa.w / 80}"/>`).join('')}</svg>`; blatt.insertAdjacentHTML('beforeend', svg); }
  };
  zeichne(); setTimeout(() => vorschau(papier()), 60);
  const was = await modal({ titel: trz(ids.length, 'Drucken (1 Bild)', 'Drucken ({0} Bilder)'), inhalt: box, klasse: 'riesig', hilfe: 'drucken', knoepfe: [
    { text: tr('Abbrechen'), wert: null }, ...(FREI ? [] : [{ text: tr('☁ PDF in Drive'), wert: 'drive' }]), { text: tr('💾 PDF speichern'), wert: 'speichern' }, { text: tr('🖨 PDF öffnen & drucken'), art: 'primaer', wert: 'drucken' }] });
  if (!was) return; state.einst.letzterDruck = o; einstSpeichern();
  const fenster = was === 'drucken' ? window.open('', '_blank') : null; if (fenster) fenster.document.write('<p style="font:16px sans-serif;padding:30px">Druckdatei wird erzeugt … (bei A0 kann das einen Moment dauern)</p>');
  try {
    const pdf = await druckPdf(recs, o, papier());
    const name = tr('Druck_{0}_{1}.pdf', papier().name.replace(/\s+/g, ''), isoDate());
    if (was === 'drucken') { const u = URL.createObjectURL(pdf); if (fenster) fenster.location.href = u; else window.open(u, '_blank'); }
    else if (was === 'speichern') dateiSpeichern(pdf, name);
    else { const f = await driveBrowser({ modus: 'ordner', titel: tr('PDF ablegen in …') }); if (f) { await drive.hochladen(pdf, name, f.id); toast(tr('PDF abgelegt in ') + f.pfad); } }
  } catch (e) { fenster?.close(); console.error(e); toast(tr('Druckdatei: ') + e.message, 'fehler', 7000); }
}
function platz(pa, o, img) { const z = raster(pa, o, 1)[0]; if (!img) return z; const pl = einpassen(z, img.width / img.height, o.modus); return o.modus === 'fuellen' ? z : pl; }
function raster(pa, o, n) {
  const r = o.rand, unter = o.unterschrift ? Math.max(6, pa.h * 0.025) : 0; const W = pa.w - 2 * r, H = pa.h - 2 * r;
  if (n <= 1) return [{ x: r, y: r, w: W, h: H - unter, unter }];
  const sp = n === 2 ? (pa.w > pa.h ? 2 : 1) : n === 4 ? 2 : n === 6 ? (pa.w > pa.h ? 3 : 2) : n === 9 ? 3 : (pa.w > pa.h ? 4 : 3); const zl = Math.ceil(n / sp), gap = 5;
  const zw = (W - gap * (sp - 1)) / sp, zh = (H - gap * (zl - 1)) / zl; const out = [];
  for (let i = 0; i < n; i++) { const c = i % sp, rr = Math.floor(i / sp); out.push({ x: r + c * (zw + gap), y: r + rr * (zh + gap), w: zw, h: zh - unter, unter }); }
  return out;
}
function einpassen(z, ratio, modus) {
  let w = z.w, h = w / ratio; if ((modus === 'fuellen') ? h < z.h : h > z.h) { h = z.h; w = h * ratio; }
  return { x: z.x + (z.w - w) / 2, y: z.y + (z.h - h) / 2, w, h };
}
function posterKacheln(pa, o) {
  const pp = PAPIER.find(p => p.id === o.posterPapier) || PAPIER[4]; const rand = 6, ueber = 10;
  const rechne = (quer) => {
    const bw = (quer ? pp.h : pp.w) - 2 * rand, bh = (quer ? pp.w : pp.h) - 2 * rand;
    const nx = Math.ceil((pa.w - ueber) / (bw - ueber)), ny = Math.ceil((pa.h - ueber) / (bh - ueber)); const kacheln = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) kacheln.push({ i, j, x: i * (bw - ueber), y: j * (bh - ueber), w: bw, h: bh });
    return { n: nx * ny, nx, ny, kacheln, bw, bh, rand, blattW: quer ? pp.h : pp.w, blattH: quer ? pp.w : pp.h };
  };
  const a = rechne(true), b = rechne(false); return a.n <= b.n ? a : b;
}
/** hochrechnen: schrittweise vergrößern + nachschärfen (für große Drucke aus kleinen Bildern) */
function hochrechnen(src, W, H) {
  let c = src;
  while (c.width * 1.9 < W) { const t = document.createElement('canvas'); t.width = c.width * 2; t.height = c.height * 2; const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, t.width, t.height); c = t; }
  const t = document.createElement('canvas'); t.width = W; t.height = H; const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, W, H);
  try { const G = E.gl(); if (W <= G.max && H <= G.max) { G.arbeitsbild(t, null); const out = G.farbe({ ...E.neueBearbeitung(), adj: { ...E.ADJ_DEFAULT, sharpen: 22 } }); x.drawImage(out, 0, 0); } } catch (e) { console.warn(e); }
  return t;
}
async function druckBild(rec, mmW, mmH, o) {
  const pxW = Math.round(mmW / MM * o.dpi), pxH = Math.round(mmH / MM * o.dpi); const maxPx = 9000; const k = Math.min(1, maxPx / Math.max(pxW, pxH));
  const W = Math.round(pxW * k), H = Math.round(pxH * k); const bmp = await bitmap(rec);
  let c = E.rendern(bmp, rec.id, rec.edit, { maxW: W, maxH: H });
  if (o.legende && legende(rec.edit?.markup).length) c = legendeAnhaengen(c, rec.edit.markup);
  if (c.width < W * 0.98 && c.height < H * 0.98) { const f = Math.min(W / c.width, H / c.height); c = hochrechnen(c, Math.round(c.width * f), Math.round(c.height * f)); }
  if (o.wz) await wasserzeichen(c, { ...state.einst.wz, an: true });
  return c;
}
async function druckPdf(recs, o, pa) {
  await ladeSkript('lib/jspdf.umd.min.js'); const { jsPDF } = window.jspdf;
  const jpg = async (c) => new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
  const p = fortschritt(tr('Druckdatei erzeugen'));
  try {
    if (o.poster) {
      const t = posterKacheln(pa, o); const doc = new jsPDF({ unit: 'mm', format: [t.blattW, t.blattH], orientation: t.blattW > t.blattH ? 'l' : 'p', compress: true }); await pdfSchrift(doc);
      const z = raster(pa, o, 1)[0]; p.set(0, 1, tr('Großes Bild wird berechnet …')); const gross = await druckBild(recs[0], z.w, z.h, o); const pl = einpassen(z, gross.width / gross.height, o.modus);
      const pxProMm = gross.width / pl.w;
      for (let n = 0; n < t.kacheln.length; n++) {
        if (p.abgebrochen) throw new Error('abgebrochen'); const q = t.kacheln[n]; p.set(n, t.n, tr('Blatt {0} von {1}', n + 1, t.n)); if (n) doc.addPage([t.blattW, t.blattH], t.blattW > t.blattH ? 'l' : 'p');
        const sx = (q.x - pl.x) * pxProMm, sy = (q.y - pl.y) * pxProMm, sw = q.w * pxProMm, sh = q.h * pxProMm;
        const k = document.createElement('canvas'); k.width = Math.max(1, Math.round(sw)); k.height = Math.max(1, Math.round(sh)); const kx = k.getContext('2d'); kx.fillStyle = '#fff'; kx.fillRect(0, 0, k.width, k.height); kx.drawImage(gross, -sx, -sy);
        doc.addImage(await jpg(k), 'JPEG', t.rand, t.rand, q.w, q.h, undefined, 'FAST');
        doc.setDrawColor(196, 30, 30); doc.setLineWidth(0.2); doc.setLineDashPattern([2, 2], 0);
        if (q.i > 0) doc.line(t.rand + 10, t.rand, t.rand + 10, t.rand + q.h); if (q.j > 0) doc.line(t.rand, t.rand + 10, t.rand + q.w, t.rand + 10);
        doc.setLineDashPattern([], 0); doc.setFontSize(7); doc.setTextColor(120); doc.text(tr('Teil {0}{1}  (Zeile {2}, Spalte {3} von {4}×{5}) · rot gestrichelt = Klebekante 10 mm', String.fromCharCode(65 + q.j), q.i + 1, q.j + 1, q.i + 1, t.ny, t.nx), t.rand, t.blattH - 2.5);
      }
      return doc.output('blob');
    }
    const doc = new jsPDF({ unit: 'mm', format: [pa.w, pa.h], orientation: pa.w > pa.h ? 'l' : 'p', compress: true }); await pdfSchrift(doc, o.unterschrift ? recs.map(r => r.titel || r.name) : []);
    const n = recs.length > 1 ? o.proSeite : 1; const seiten = Math.ceil(recs.length / n);
    for (let s = 0; s < seiten; s++) {
      if (s) doc.addPage([pa.w, pa.h], pa.w > pa.h ? 'l' : 'p'); const zellen = raster(pa, o, n);
      for (let i = 0; i < n; i++) {
        const r = recs[s * n + i]; if (!r) break; if (p.abgebrochen) throw new Error('abgebrochen'); p.set(s * n + i, recs.length, tr('Bild {0} von {1}', s * n + i + 1, recs.length));
        const z = zellen[i]; const c = await druckBild(r, z.w, z.h, o); const pl = einpassen(z, c.width / c.height, o.modus);
        if (o.modus === 'fuellen') { const f = c.width / pl.w; const k = document.createElement('canvas'); k.width = Math.round(z.w * f); k.height = Math.round(z.h * f); k.getContext('2d').drawImage(c, -(z.x - pl.x) * f, -(z.y - pl.y) * f); doc.addImage(await jpg(k), 'JPEG', z.x, z.y, z.w, z.h, undefined, 'FAST'); }
        else doc.addImage(await jpg(c), 'JPEG', pl.x, pl.y, pl.w, pl.h, undefined, 'FAST');
        if (o.unterschrift) { doc.setFontSize(Math.max(7, Math.min(16, pa.w / 30))); doc.setTextColor(60); doc.text(`${r.titel || r.name.replace(/\.[^.]+$/, '')}  ·  ${new Date(r.aufnahme).toLocaleDateString(LOCALE)}`, z.x, Math.min(pa.h - 2, z.y + z.h + z.unter * 0.7), { maxWidth: z.w }); }
      }
    }
    return doc.output('blob');
  } finally { p.zu(); }
}

/* ═════════ Vorschlagsblatt für den Bauherrn (PDF + Word, Ablage in der Baustelle) ═════════ */
export async function vorschlagDialog(id) {
  if (FREI) return vorschlagDialogFrei(id);
  const rec = state.recs.get(id); if (!rec) return; const L = legende(rec.edit?.markup);
  const f = { bauvorhaben: rec.quelleInfo?.baustelle || state.einst.letzteBaustelle?.name || '', betreff: 'Vorschlag zur Ausführung – bitte um Ihre schriftliche Freigabe', text: '', frist: '', baustelleId: rec.quelleInfo?.baustelleId || '' }; // i18n-aus (Firmenblatt bleibt deutsch)
  const inp = (k, ph, gross) => gross ? el('textarea', { class: 'inp', rows: 4, style: 'width:100%', placeholder: ph, oninput: (e) => f[k] = e.target.value }, f[k]) : el('input', { class: 'inp', style: 'width:100%', value: f[k], placeholder: ph, oninput: (e) => f[k] = e.target.value });
  const inhalt = el('div', {},
    L.length ? el('div', { class: 'notiz gruen' }, tr('{0} nummerierte Punkte werden als Legende aufgeführt.', L.length)) : el('div', { class: 'notiz' }, tr('Tipp: Mit „Einzeichnen“ → ① nummerierte Punkte setzen – deren Erklärungen erscheinen auf dem Blatt als Liste.')),
    el('label', { class: 'lbl' }, tr('Bauvorhaben')), el('div', { class: 'zeile' }, inp('bauvorhaben', FIRMA.beispiel), el('button', { class: 'btn klein', onclick: async () => { const b = await baustelleWaehlen(); if (b) { f.bauvorhaben = b.name; f.baustelleId = b.id; inhalt.querySelector('input').value = b.name; } } }, tr('🏗 wählen'))),
    el('label', { class: 'lbl' }, tr('Betreff')), inp('betreff', ''),
    el('label', { class: 'lbl' }, tr('Erläuterung (optional)')), inp('text', tr('z. B. Wir schlagen vor, die Fliesen im Bereich ① als Sockel bis 1,20 m zu führen …'), true),
    el('label', { class: 'lbl' }, tr('Rückmeldung erbeten bis (optional)')), el('input', { class: 'inp', type: 'date', oninput: (e) => f.frist = e.target.value }),
    el('p', { class: 'hinweis' }, tr('Es entsteht ein A4-Blatt mit Briefkopf, Bild mit Einzeichnungen und Legende – als PDF und Word. Mit Baustelle wird beides in deren Ordner 02_Schriftverkehr abgelegt.')));
  const ok = await modal({ titel: tr('Vorschlagsblatt für den Bauherrn'), inhalt, breit: true, hilfe: 'vorschlag', knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('📄 Blatt erzeugen'), art: 'primaer', wert: true }] });
  if (!ok) return;
  const p = fortschritt(tr('Vorschlagsblatt'));
  try {
    p.set(0, 3, tr('Bild wird aufbereitet …')); const bmp = await bitmap(rec); const bild = E.rendern(bmp, rec.id, rec.edit, { maxW: 2400, maxH: 2400 });
    p.set(1, 3, tr('PDF …')); const pdf = await vorschlagPdf(bild, L, f); p.set(2, 3, tr('Word …')); const docx = await vorschlagDocx(bild, L, f);
    const basis = `${isoDate()}_Vorschlag_${dateiname(f.bauvorhaben || 'Bauvorhaben')}`;
    let abgelegt = '';
    if (f.baustelleId && drive.verbunden()) { try { const ziel = await zielSchriftverkehr(f.baustelleId); await drive.hochladen(pdf, basis + '.pdf', ziel); await drive.hochladen(docx, basis + '.docx', ziel); abgelegt = tr(' · abgelegt in ') + f.bauvorhaben + tr(' › 02_Schriftverkehr'); } catch (e) { console.warn(e); abgelegt = tr(' · Drive-Ablage fehlgeschlagen: ') + e.message; } }
    p.zu(); dateiSpeichern(pdf, basis + '.pdf'); setTimeout(() => dateiSpeichern(docx, basis + '.docx'), 500);
    toast(tr('Vorschlagsblatt erstellt (PDF + Word)') + abgelegt, abgelegt.includes('fehl') ? 'warn' : 'ok', 7000);
    return { pdf, docx, name: basis };
  } catch (e) { p.zu(); console.error(e); toast(tr('Vorschlagsblatt: ') + e.message, 'fehler', 7000); }
}
async function zielSchriftverkehr(baustelleId) { const u = await drive.unterordner(baustelleId); const v = u.find(x => /^02[_ ]/.test(x.name)); return v ? v.id : drive.ordnerSichern(baustelleId, '02_Schriftverkehr'); }
async function vorschlagPdf(bild, L, f) {
  await ladeSkript('lib/jspdf.umd.min.js'); const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210, H = 297, li = 22, re = 18;
  await pdfSchrift(doc, f.betreff, f.bauvorhaben, f.text, f.frist, L.map(l => l.text));
  const logo = await ladeBild('img/tw-logo.jpg'); doc.addImage(logo, 'JPEG', li, 14, 70, 70 / 3.3989);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(51); FIRMA.zeilen.forEach((z, i) => doc.text(z, W - re, 16 + i * 3.9, { align: 'right' }));
  doc.setDrawColor(196, 30, 30); doc.setLineWidth(0.8); doc.line(li, 41, W - re, 41); doc.setFontSize(6); doc.setTextColor(170); doc.text(FIRMA.absender, li, 45);
  let y = 54; doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(doc.splitTextToSize(f.betreff || 'Vorschlag', W - li - re), li, y); y += 7 * doc.splitTextToSize(f.betreff || '', W - li - re).length;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80); doc.text(`Bauvorhaben: ${f.bauvorhaben || '–'}      Datum: ${new Date().toLocaleDateString('de-DE')}`, li, y); y += 6;
  if (f.text) { doc.setTextColor(34); doc.setFontSize(10); const z = doc.splitTextToSize(f.text, W - li - re); doc.text(z, li, y); y += z.length * 4.6 + 2; }
  const maxH = H - 34 - y - (L.length ? Math.min(70, 8 + L.length * 6) : 0) - (f.frist ? 12 : 8); const bw = W - li - re; let iw = bw, ih = iw * bild.height / bild.width; if (ih > maxH) { ih = maxH; iw = ih * bild.width / bild.height; }
  const jpg = new Uint8Array(await (await new Promise(r => bild.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer()); doc.addImage(jpg, 'JPEG', li + (bw - iw) / 2, y, iw, ih, undefined, 'FAST'); doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(li + (bw - iw) / 2, y, iw, ih); y += ih + 6;
  if (L.length) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(17); doc.text('Erläuterung der markierten Punkte', li, y); y += 5.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); // i18n-aus (Firmenblatt bleibt deutsch)
    for (const l of L) { const [r, g, b] = hexRgb(l.farbe || '#e5242a'); doc.setFillColor(r, g, b); doc.circle(li + 2.6, y - 1.2, 2.4, 'F'); doc.setTextColor(255); doc.setFontSize(8); doc.text(String(l.nr), li + 2.6, y - 0.1, { align: 'center' }); doc.setTextColor(34); doc.setFontSize(9.5); const z = doc.splitTextToSize(l.text || '–', W - li - re - 9); doc.text(z, li + 8, y); y += Math.max(6, z.length * 4.4 + 1.5); } }
  y += 2; doc.setFontSize(9.5); doc.setTextColor(34); doc.text(doc.splitTextToSize(`Bitte bestätigen Sie uns den Vorschlag oder Ihre Änderungswünsche schriftlich${f.frist ? ' bis zum ' + new Date(f.frist).toLocaleDateString('de-DE') : ''}, damit alles nachvollziehbar dokumentiert ist.`, W - li - re), li, Math.min(y, H - 40));
  doc.setDrawColor(196, 30, 30); doc.setLineWidth(0.5); doc.line(li, H - 24, W - re, H - 24); doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(196, 30, 30); doc.text(FIRMA.name, li, H - 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(102); doc.text(FIRMA.steuer, W - re, H - 20, { align: 'right' }); doc.text(FIRMA.bank1, li, H - 16.5); doc.text('Seite 1', W - re, H - 16.5, { align: 'right' }); doc.text(FIRMA.bank2, li, H - 13);
  return doc.output('blob');
}
function hexRgb(h) { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
async function vorschlagDocx(bild, L, f) {
  await ladeSkript('lib/docx.iife.js'); const D = window.docx;
  const bytes = async (c, typ = 'image/jpeg') => new Uint8Array(await (await new Promise(r => c.toBlob(r, typ, 0.9))).arrayBuffer());
  const logo = await ladeBild('img/tw-logo.jpg'); const lc = document.createElement('canvas'); lc.width = logo.width; lc.height = logo.height; lc.getContext('2d').drawImage(logo, 0, 0);
  const pt = (n) => n * 2; const grau = '666666', rot = 'C41E1E'; const maxW = 600; const iw = maxW, ih = Math.round(maxW * bild.height / bild.width); const k = Math.min(1, 520 / ih);
  const absatz = (text, o = {}) => new D.Paragraph({ alignment: o.align, spacing: { after: o.after ?? 80 }, children: [new D.TextRun({ text, bold: o.bold, size: pt(o.size || 10), color: o.color, font: 'Arial' })] });
  const kinder = [
    new D.Paragraph({ children: [new D.ImageRun({ type: 'jpg', data: await bytes(lc), transformation: { width: 260, height: 77 } })] }),
    ...FIRMA.zeilen.map(z => absatz(z, { align: D.AlignmentType.RIGHT, size: 8.5, color: '333333', after: 0 })),
    new D.Paragraph({ border: { bottom: { color: rot, size: 12, style: D.BorderStyle.SINGLE, space: 1 } }, spacing: { after: 60 }, children: [] }),
    absatz(FIRMA.absender, { size: 6, color: 'AAAAAA', after: 200 }),
    absatz(f.betreff || 'Vorschlag', { bold: true, size: 14, after: 80 }),
    absatz(`Bauvorhaben: ${f.bauvorhaben || '–'}      Datum: ${new Date().toLocaleDateString('de-DE')}`, { size: 9.5, color: '505050', after: 160 }),
    ...(f.text ? f.text.split('\n').map(z => absatz(z, { size: 10 })) : []),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 160 }, children: [new D.ImageRun({ type: 'jpg', data: await bytes(bild), transformation: { width: Math.round(iw * k), height: Math.round(ih * k) } })] }),
    ...(L.length ? [absatz('Erläuterung der markierten Punkte', { bold: true, size: 10.5 }), ...L.map(l => new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun({ text: ` ${l.nr} `, bold: true, color: 'FFFFFF', shading: { fill: (l.farbe || '#e5242a').replace('#', ''), type: D.ShadingType.CLEAR, color: 'auto' }, font: 'Arial', size: pt(9.5) }), new D.TextRun({ text: '  ' + (l.text || '–'), font: 'Arial', size: pt(9.5) })] }))] : []), // i18n-aus (Firmenblatt bleibt deutsch)
    absatz(`Bitte bestätigen Sie uns den Vorschlag oder Ihre Änderungswünsche schriftlich${f.frist ? ' bis zum ' + new Date(f.frist).toLocaleDateString('de-DE') : ''}, damit alles nachvollziehbar dokumentiert ist.`, { size: 9.5 })
  ];
  const fuss = new D.Footer({ children: [
    new D.Paragraph({ border: { top: { color: rot, size: 8, style: D.BorderStyle.SINGLE, space: 1 } }, children: [new D.TextRun({ text: FIRMA.name, bold: true, color: rot, size: pt(7), font: 'Arial' }), new D.TextRun({ text: '\t' + FIRMA.steuer, color: grau, size: pt(6.5), font: 'Arial' })], tabStops: [{ type: D.TabStopType.RIGHT, position: 9600 }] }),
    absatz(FIRMA.bank1, { size: 6.5, color: grau, after: 0 }), absatz(FIRMA.bank2, { size: 6.5, color: grau, after: 0 })] });
  const doc = new D.Document({ sections: [{ properties: { page: { margin: { top: 1000, right: 1020, bottom: 1500, left: 1250 } } }, footers: { default: fuss }, children: kinder }] });
  return D.Packer.toBlob(doc);
}
/* ═════════ Vorschlagsblatt der kostenlosen Fassung: neutral, ohne Briefkopf/Firmendaten, nur Download ═════════ */
async function vorschlagDialogFrei(id) {
  const rec = state.recs.get(id); if (!rec) return; const L = legende(rec.edit?.markup);
  const f = { titel: tr('Vorschlag zur Ausführung'), projekt: '', absender: state.einst.vorschlagAbsender || '', text: '', frist: '', schluss: tr('Bitte bestätigen Sie den Vorschlag oder Ihre Änderungswünsche schriftlich{frist}.') };
  const inp = (k, ph, zeilen) => zeilen ? el('textarea', { class: 'inp', rows: zeilen, style: 'width:100%', placeholder: ph, oninput: (e) => f[k] = e.target.value }, f[k]) : el('input', { class: 'inp', style: 'width:100%', value: f[k], placeholder: ph, oninput: (e) => f[k] = e.target.value });
  const inhalt = el('div', {},
    L.length ? el('div', { class: 'notiz gruen' }, tr('{0} nummerierte Punkte werden als Legende aufgeführt.', L.length)) : el('div', { class: 'notiz' }, tr('Tipp: Mit „Einzeichnen“ → ① nummerierte Punkte setzen – deren Erklärungen erscheinen auf dem Blatt als Liste.')),
    el('label', { class: 'lbl' }, tr('Titel (Überschrift)')), inp('titel', tr('z. B. Vorschlag Fliesenspiegel Bad')),
    el('label', { class: 'lbl' }, tr('Projekt / Objekt (optional)')), inp('projekt', tr('z. B. Bad Obergeschoss, Musterstraße 1')),
    el('label', { class: 'lbl' }, tr('Absender (optional – erscheint oben rechts, wird für das nächste Blatt gemerkt)')), inp('absender', tr('Name / Firma\nStraße Nr.\nPLZ Ort\nTelefon · E-Mail'), 4),
    el('label', { class: 'lbl' }, tr('Erläuterung (optional)')), inp('text', tr('z. B. Wir schlagen vor, die Fliesen im Bereich ① bis 1,20 m Höhe zu führen …'), 4),
    el('label', { class: 'lbl' }, tr('Rückmeldung erbeten bis (optional)')), el('input', { class: 'inp', type: 'date', oninput: (e) => f.frist = e.target.value }),
    el('label', { class: 'lbl' }, tr('Schlusssatz (optional, {frist} = Datum)')), inp('schluss', ''),
    el('p', { class: 'hinweis' }, tr('Es entsteht ein neutrales A4-Blatt mit deinem Titel, dem Bild mit Einzeichnungen und der Legende – als PDF und als Word-Datei zum Weiterbearbeiten. Beides wird heruntergeladen.')));
  const ok = await modal({ titel: tr('Vorschlagsblatt (PDF + Word)'), inhalt, breit: true, hilfe: 'vorschlag', knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('📄 Blatt erzeugen'), art: 'primaer', wert: true }] });
  if (!ok) return;
  state.einst.vorschlagAbsender = f.absender; einstSpeichern();
  f.schlussText = (f.schluss || '').replace(/\{frist\}/g, f.frist ? tr(' bis zum ') + new Date(f.frist).toLocaleDateString(LOCALE) : '').trim();
  const p = fortschritt(tr('Vorschlagsblatt'));
  try {
    p.set(0, 3, tr('Bild wird aufbereitet …')); const bmp = await bitmap(rec); const bild = E.rendern(bmp, rec.id, rec.edit, { maxW: 2400, maxH: 2400 });
    p.set(1, 3, tr('PDF …')); const pdf = await vorschlagPdfFrei(bild, L, f); p.set(2, 3, tr('Word …')); const docx = await vorschlagDocxFrei(bild, L, f);
    const basis = `${isoDate()}_Vorschlag_${dateiname(f.projekt || f.titel || 'Blatt')}`;
    p.zu(); dateiSpeichern(pdf, basis + '.pdf'); setTimeout(() => dateiSpeichern(docx, basis + '.docx'), 500);
    toast(tr('Vorschlagsblatt erstellt (PDF + Word) – liegt in „Downloads“'), 'ok', 7000);
    return { pdf, docx, name: basis };
  } catch (e) { p.zu(); console.error(e); toast(tr('Vorschlagsblatt: ') + e.message, 'fehler', 7000); }
}
async function vorschlagPdfFrei(bild, L, f) {
  await ladeSkript('lib/jspdf.umd.min.js'); const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210, H = 297, li = 22, re = 18;
  await pdfSchrift(doc, f.titel, f.projekt, f.absender, f.text, f.schlussText, f.frist, L.map(l => l.text));
  const abs = (f.absender || '').split('\n').map(z => z.trim()).filter(Boolean).slice(0, 6);
  let y = 18;
  if (abs.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70); abs.forEach((z, i) => doc.text(z, W - re, 16 + i * 3.9, { align: 'right' })); y = 16 + abs.length * 3.9 + 4; }
  doc.setDrawColor(150); doc.setLineWidth(0.4); doc.line(li, y, W - re, y); y += 10;
  doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); const tz = doc.splitTextToSize(f.titel || tr('Vorschlag'), W - li - re); doc.text(tz, li, y); y += 7 * tz.length;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80); doc.text((f.projekt ? tr('Projekt / Objekt: {0}      ', f.projekt) : '') + tr('Datum: {0}', new Date().toLocaleDateString(LOCALE)), li, y); y += 6;
  if (f.text) { doc.setTextColor(34); doc.setFontSize(10); const z = doc.splitTextToSize(f.text, W - li - re); doc.text(z, li, y); y += z.length * 4.6 + 2; }
  const maxH = H - 24 - y - (L.length ? Math.min(70, 8 + L.length * 6) : 0) - (f.schlussText ? 12 : 4); const bw = W - li - re; let iw = bw, ih = iw * bild.height / bild.width; if (ih > maxH) { ih = maxH; iw = ih * bild.width / bild.height; }
  const jpg = new Uint8Array(await (await new Promise(r => bild.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer()); doc.addImage(jpg, 'JPEG', li + (bw - iw) / 2, y, iw, ih, undefined, 'FAST'); doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(li + (bw - iw) / 2, y, iw, ih); y += ih + 6;
  if (L.length) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(17); doc.text(tr('Erläuterung der markierten Punkte'), li, y); y += 5.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    for (const l of L) { const [r, g, b] = hexRgb(l.farbe || '#e5242a'); doc.setFillColor(r, g, b); doc.circle(li + 2.6, y - 1.2, 2.4, 'F'); doc.setTextColor(255); doc.setFontSize(8); doc.text(String(l.nr), li + 2.6, y - 0.1, { align: 'center' }); doc.setTextColor(34); doc.setFontSize(9.5); const z = doc.splitTextToSize(l.text || '–', W - li - re - 9); doc.text(z, li + 8, y); y += Math.max(6, z.length * 4.4 + 1.5); } }
  if (f.schlussText) { y += 2; doc.setFontSize(9.5); doc.setTextColor(34); doc.text(doc.splitTextToSize(f.schlussText, W - li - re), li, Math.min(y, H - 22)); }
  doc.setFontSize(7); doc.setTextColor(140); doc.text(tr('Seite 1'), W - re, H - 12, { align: 'right' });
  return doc.output('blob');
}
async function vorschlagDocxFrei(bild, L, f) {
  await ladeSkript('lib/docx.iife.js'); const D = window.docx;
  const bytes = async (c, typ = 'image/jpeg') => new Uint8Array(await (await new Promise(r => c.toBlob(r, typ, 0.9))).arrayBuffer());
  const pt = (n) => n * 2; const maxW = 600; const iw = maxW, ih = Math.round(maxW * bild.height / bild.width); const k = Math.min(1, 520 / ih);
  const absatz = (text, o = {}) => new D.Paragraph({ alignment: o.align, spacing: { after: o.after ?? 80 }, children: [new D.TextRun({ text, bold: o.bold, size: pt(o.size || 10), color: o.color, font: 'Arial' })] });
  const abs = (f.absender || '').split('\n').map(z => z.trim()).filter(Boolean).slice(0, 6);
  const kinder = [
    ...abs.map(z => absatz(z, { align: D.AlignmentType.RIGHT, size: 8.5, color: '464646', after: 0 })),
    new D.Paragraph({ border: { bottom: { color: '999999', size: 6, style: D.BorderStyle.SINGLE, space: 1 } }, spacing: { after: 240 }, children: [] }),
    absatz(f.titel || tr('Vorschlag'), { bold: true, size: 15, after: 80 }),
    absatz((f.projekt ? tr('Projekt / Objekt: {0}      ', f.projekt) : '') + tr('Datum: {0}', new Date().toLocaleDateString(LOCALE)), { size: 9.5, color: '505050', after: 160 }),
    ...(f.text ? f.text.split('\n').map(z => absatz(z, { size: 10 })) : []),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 160 }, children: [new D.ImageRun({ type: 'jpg', data: await bytes(bild), transformation: { width: Math.round(iw * k), height: Math.round(ih * k) } })] }),
    ...(L.length ? [absatz(tr('Erläuterung der markierten Punkte'), { bold: true, size: 10.5 }), ...L.map(l => new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun({ text: ` ${l.nr} `, bold: true, color: 'FFFFFF', shading: { fill: (l.farbe || '#e5242a').replace('#', ''), type: D.ShadingType.CLEAR, color: 'auto' }, font: 'Arial', size: pt(9.5) }), new D.TextRun({ text: '  ' + (l.text || '–'), font: 'Arial', size: pt(9.5) })] }))] : []),
    ...(f.schlussText ? [absatz(f.schlussText, { size: 9.5 })] : [])
  ];
  const doc = new D.Document({ sections: [{ properties: { page: { margin: { top: 1000, right: 1020, bottom: 1200, left: 1250 } } }, children: kinder }] });
  return D.Packer.toBlob(doc);
}
void esc; void clamp;
