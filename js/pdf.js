// TW Bildstudio – PDF-Pläne und -Dokumente öffnen (pdf.js, lokal in lib/pdfjs, Apache 2.0)
// Jede gewählte PDF-Seite wird in hoher Auflösung zu einem Bild – darauf wird wie auf einem Foto gezeichnet.
// Die Papiergröße der Seite (mm) wird gemerkt, damit das Ergebnis wieder als PDF in Originalgröße gespeichert werden kann.
import { el, modal, fortschritt, toast } from './util.js';
import { tr, trz } from './i18n.js';

const PDF_RE = /\.pdf$/i;
export const istPdf = (f) => f?.type === 'application/pdf' || PDF_RE.test(f?.name || '');
const PT_MM = 25.4 / 72;

let ladeP = null;
async function pdfjs() {
  if (!ladeP) ladeP = (async () => {
    const lib = await import(new URL('../lib/pdfjs/pdf.min.mjs', import.meta.url).href);
    lib.GlobalWorkerOptions.workerSrc = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return lib;
  })().catch(e => { ladeP = null; throw new Error(tr('PDF-Leser konnte nicht geladen werden.')); });
  return ladeP;
}
async function oeffnen(file) {
  const lib = await pdfjs(); const daten = new Uint8Array(await file.arrayBuffer());
  try {
    return await lib.getDocument({ data: daten, cMapUrl: new URL('../lib/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('../lib/pdfjs/standard_fonts/', import.meta.url).href, isEvalSupported: false }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error(tr('„{0}“ ist mit einem Kennwort geschützt und kann nicht geöffnet werden.', file.name));
    throw new Error(tr('„{0}“ ist keine lesbare PDF-Datei.', file.name));
  }
}

/** größte sinnvolle Bildkante: am Handy/Tablet kleiner, damit der Speicher reicht */
function maxKante() {
  const beruehrung = matchMedia('(pointer:coarse)').matches, kurz = Math.min(screen.width, screen.height);
  if ((navigator.deviceMemory && navigator.deviceMemory < 4) || (beruehrung && kurz < 600)) return 4096; // Handy
  return beruehrung ? 6144 : 8192; // Tablet : PC
}
/** Papierformat erkennen (A0–A5, quer/hoch) – sonst Maß in mm */
export function papierName(mmB, mmH) {
  const k = Math.min(mmB, mmH), l = Math.max(mmB, mmH);
  const A = [['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210]];
  for (const [n, a, b] of A) if (Math.abs(k - a) < 6 && Math.abs(l - b) < 6) return n + (mmB > mmH ? ' ' + tr('quer') : '');
  return `${Math.round(mmB)} × ${Math.round(mmH)} mm`;
}

/** Eine Seite als Bild rendern: 300 dpi, höchstens maxKante() Pixel an der langen Seite, weißer Grund */
async function seiteRendern(doc, nr, { kante = maxKante(), dpi = 300 } = {}) {
  const seite = await doc.getPage(nr); const v1 = seite.getViewport({ scale: 1 });
  const mmB = v1.width * PT_MM, mmH = v1.height * PT_MM;
  const skala = Math.min(dpi / 72, kante / Math.max(v1.width, v1.height));
  const v = seite.getViewport({ scale: skala });
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(v.width)); c.height = Math.max(1, Math.floor(v.height));
  const x = c.getContext('2d', { alpha: false }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await seite.render({ canvasContext: x, viewport: v, background: 'rgb(255,255,255)', annotationMode: 1 }).promise;
  seite.cleanup();
  // Pläne sind Strichzeichnungen → verlustfrei (PNG). Fotoseiten würden als PNG riesig → dann JPEG in hoher Qualität.
  let blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (blob.size > 14 * 1024 * 1024) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.94));
  const w = c.width, h = c.height; c.width = c.height = 1;
  return { blob, w, h, mmB, mmH, dpi: Math.round(skala * 72) };
}

/** kleine Vorschau einer Seite für die Seitenwahl */
async function vorschau(doc, nr, ziel) {
  const seite = await doc.getPage(nr); const v1 = seite.getViewport({ scale: 1 }); const v = seite.getViewport({ scale: 150 / Math.max(v1.width, v1.height) });
  ziel.width = Math.floor(v.width); ziel.height = Math.floor(v.height); const x = ziel.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, ziel.width, ziel.height);
  await seite.render({ canvasContext: x, viewport: v }).promise; seite.cleanup();
}

/** Seitenwahl bei mehrseitigen PDFs. Rückgabe: Liste der Seitennummern oder null (abgebrochen) */
async function seitenWaehlen(doc, name) {
  const n = doc.numPages; if (n === 1) return [1];
  const gewaehlt = new Set(Array.from({ length: Math.min(n, 30) }, (_, i) => i + 1));
  const info = el('div', { class: 'hinweis' }); const raster = el('div', { class: 'pdf-seiten' });
  const neuInfo = () => { info.textContent = tr('{0} von {1} Seiten ausgewählt', gewaehlt.size, n) + (gewaehlt.size > 30 ? ' · ' + tr('viele Seiten brauchen etwas Zeit') : ''); };
  const kacheln = [];
  for (let i = 1; i <= n; i++) {
    const cv = el('canvas', { width: 106, height: 150 });
    const k = el('button', { class: 'pdf-seite' + (gewaehlt.has(i) ? ' an' : ''), title: tr('Seite {0}', i), onclick: () => { gewaehlt.has(i) ? gewaehlt.delete(i) : gewaehlt.add(i); k.classList.toggle('an', gewaehlt.has(i)); neuInfo(); } }, cv, el('small', {}, tr('Seite {0}', i)));
    kacheln.push([i, k, cv]); raster.append(k);
  }
  const alle = (an) => { for (const [i, k] of kacheln) { an ? gewaehlt.add(i) : gewaehlt.delete(i); k.classList.toggle('an', an); } neuInfo(); };
  const inhalt = el('div', {}, el('p', {}, tr('„{0}“ hat {1} Seiten. Welche Seiten möchtest du als Bild bearbeiten?', name, n)),
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', onclick: () => alle(true) }, tr('Alle Seiten')), el('button', { class: 'btn klein', onclick: () => alle(false) }, tr('Keine'))), info, raster);
  neuInfo();
  // Vorschaubilder nacheinander im Hintergrund zeichnen (bricht ab, wenn der Dialog zu ist)
  let offen = true; (async () => { for (const [i, , cv] of kacheln) { if (!offen) break; try { await vorschau(doc, i, cv); } catch (e) { } } })();
  const erg = await modal({ titel: tr('PDF-Seiten wählen'), inhalt, breit: true, hilfe: 'pdf', knoepfe: [{ text: tr('Abbrechen'), wert: null }, { text: tr('Seiten übernehmen'), art: 'primaer', wert: () => [...gewaehlt].sort((a, b) => a - b) }] });
  offen = false; return erg;
}

/**
 * PDF-Dateien in Bilddateien (je Seite) umwandeln. Andere Dateien gehen unverändert durch.
 * An jeder Seiten-Datei hängt f._pdf = { datei, seite, seiten, mmB, mmH, dpi } und die Zusatzangaben der PDF (_did, _pfad …).
 */
export async function pdfsAufloesen(files) {
  const out = [];
  for (const f of files) {
    if (!istPdf(f)) { out.push(f); continue; }
    let doc = null, p = null;
    try {
      doc = await oeffnen(f); const seiten = await seitenWaehlen(doc, f.name); if (!seiten?.length) continue;
      p = fortschritt(tr('PDF wird geöffnet'));
      const basis = f.name.replace(/\.pdf$/i, '');
      for (let i = 0; i < seiten.length; i++) {
        if (p.abgebrochen) break; const nr = seiten[i]; p.set(i, seiten.length, tr('Seite {0} von {1} wird aufbereitet …', nr, doc.numPages));
        const s = await seiteRendern(doc, nr);
        const name = doc.numPages > 1 ? `${basis} – ${tr('Seite {0}', nr)}.${s.blob.type === 'image/png' ? 'png' : 'jpg'}` : `${basis}.${s.blob.type === 'image/png' ? 'png' : 'jpg'}`;
        const datei = new File([s.blob], name, { type: s.blob.type, lastModified: f.lastModified || Date.now() });
        for (const k of Object.keys(f)) if (k.startsWith('_')) datei[k] = f[k];
        datei._pdf = { datei: f.name, seite: nr, seiten: doc.numPages, mmB: +s.mmB.toFixed(1), mmH: +s.mmH.toFixed(1), dpi: s.dpi };
        datei._pdfGroesse = f.size; out.push(datei);
      }
    } catch (e) { console.warn(e); toast(e.message || String(e), 'fehler', 6000); }
    finally { p?.zu(); try { await doc?.destroy(); } catch (e) { } }
  }
  return out;
}
