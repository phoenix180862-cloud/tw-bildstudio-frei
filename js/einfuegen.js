// TW Bildstudio – Bilder in eine Zeichnung/einen Plan einfügen (Bild-Element, Fotopunkte) und Fotos groß ansehen
import { state, original, heicNachJpeg, istBild, thumbUrl } from './store.js';
import * as E from './engine.js';
import { bilderVorladen } from './markup.js';
import { istRaw, rawVorschau } from './exif.js';
import { istPdf, pdfsAufloesen } from './pdf.js';
import { el, modal, toast, fortschritt } from './util.js';
import { tr, trz } from './i18n.js';

/** Datei (Bild, HEIC, RAW oder PDF) → Liste von Bild-Blobs (PDF: gewählte Seiten) */
export async function dateienZuBlobs(files) {
  const out = []; let liste = [...files].filter(f => istBild(f) || istPdf(f));
  if (liste.some(istPdf)) liste = await pdfsAufloesen(liste);
  for (const f of liste) {
    try {
      if (istRaw(f.name)) out.push(await rawVorschau(f));
      else if (/hei[cf]$/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '')) { try { await createImageBitmap(f); out.push(f); } catch (e) { out.push(await heicNachJpeg(f)); } }
      else out.push(f);
    } catch (e) { console.warn(e); toast(tr('„{0}“ konnte nicht gelesen werden.', f.name), 'warn'); }
  }
  return out;
}

/** Dateiauswahl (PC / Handy / Kamera) → Bild-Blobs */
export function dateienWaehlen({ mehrere = true, kamera = false } = {}) {
  return new Promise(res => {
    const i = el('input', { type: 'file', accept: kamera ? 'image/*' : 'image/*,application/pdf,.pdf,.heic,.heif,.cr2,.cr3,.nef,.arw,.dng', style: 'display:none' });
    if (mehrere) i.multiple = true; if (kamera) i.setAttribute('capture', 'environment');
    i.onchange = async () => { const b = await dateienZuBlobs(i.files); i.remove(); res(b); };
    i.addEventListener('cancel', () => { i.remove(); res([]); });
    document.body.append(i); i.click();
  });
}

/** Bibliotheksbild mit all seinen Bearbeitungen als Blob (für das Einfügen in eine andere Zeichnung) */
export async function bibliotheksBild(rec, maxKante = 6000) {
  const blob = await original(rec.id); if (!blob) throw new Error(tr('Original nicht gefunden: ') + rec.name);
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    if (!rec.edit) { if (Math.max(bmp.width, bmp.height) <= maxKante && /^image\/(jpeg|png|webp)$/.test(blob.type)) return blob; }
    await bilderVorladen(rec.edit?.markup);
    const c = E.rendern(bmp, 'einf:' + rec.id + ':' + (rec.bearbeitet || 0), rec.edit, { maxW: maxKante, maxH: maxKante });
    return await new Promise(r => c.toBlob(r, rec.pdf || /png/.test(rec.typ || '') ? 'image/png' : 'image/jpeg', 0.93));
  } finally { bmp.close?.(); }
}

/** Auswahl aus der Bibliothek → Bild-Blobs */
export async function ausBibliothekWaehlen({ ohneId = null, mehrere = true, titel = tr('Bild aus der Bibliothek wählen') } = {}) {
  const recs = [...state.recs.values()].filter(r => r.id !== ohneId && r.flag !== -1).sort((a, b) => (b.importiert || 0) - (a.importiert || 0));
  if (!recs.length) { toast(tr('In der Bibliothek sind noch keine anderen Bilder.'), 'warn'); return []; }
  const gewaehlt = new Set(); let filter = '';
  const info = el('div', { class: 'hinweis' }); const raster = el('div', { class: 'dv-raster' });
  const such = el('input', { class: 'inp', type: 'search', placeholder: tr('Suchen (Name, Ordner, Stichwort) …'), style: 'width:100%;margin-bottom:8px', oninput: (e) => { filter = e.target.value.toLowerCase(); zeichne(); } });
  const zeichne = () => {
    raster.innerHTML = '';
    for (const r of recs.filter(r => !filter || (r.name + ' ' + (r.titel || '') + ' ' + (r.stichworte || []).join(' ')).toLowerCase().includes(filter)).slice(0, 300)) {
      const img = el('img', { alt: '', loading: 'lazy' }); thumbUrl(r).then(u => img.src = u);
      raster.append(el('div', { class: 'dv-el' + (gewaehlt.has(r.id) ? ' an' : ''), title: r.name, onclick: (e) => {
        if (!mehrere) { gewaehlt.clear(); raster.querySelectorAll('.an').forEach(x => x.classList.remove('an')); }
        gewaehlt.has(r.id) ? gewaehlt.delete(r.id) : gewaehlt.add(r.id); e.currentTarget.classList.toggle('an', gewaehlt.has(r.id)); neu();
      } }, el('div', { class: 'bx' }, img), el('div', { class: 'nm' }, r.titel || r.name)));
    }
  };
  const neu = () => { info.textContent = trz(gewaehlt.size, '{0} Bild ausgewählt', '{0} Bilder ausgewählt'); };
  zeichne(); neu();
  const ids = await modal({ titel, inhalt: el('div', {}, such, info, raster), breit: true, hilfe: 'plan-bilder', knoepfe: [{ text: tr('Abbrechen'), wert: null }, { text: tr('Einfügen'), art: 'primaer', wert: () => [...gewaehlt] }] });
  if (!ids?.length) return [];
  const p = ids.length > 1 ? fortschritt(tr('Bilder werden vorbereitet')) : null; const out = [];
  try { for (let i = 0; i < ids.length; i++) { p?.set(i, ids.length); out.push(await bibliotheksBild(state.recs.get(ids[i]))); } }
  catch (e) { console.warn(e); toast(e.message, 'fehler'); } finally { p?.zu(); }
  return out;
}

/** Bilder aus der Zwischenablage */
export async function ausZwischenablage() {
  try {
    const out = []; for (const it of await navigator.clipboard.read()) for (const t of it.types) if (t.startsWith('image/')) out.push(await it.getType(t));
    if (!out.length) toast(tr('In der Zwischenablage ist kein Bild.'), 'warn'); return out;
  } catch (e) { toast(tr('Bitte einfach Strg+V drücken.'), 'warn'); return []; }
}

/** Foto groß ansehen (Zoom mit Mausrad/Fingern, Ziehen zum Verschieben) */
export async function fotoGross(blob, titel = '') {
  if (!blob) { toast(tr('Foto nicht gefunden.'), 'warn'); return; }
  const url = URL.createObjectURL(blob); const img = el('img', { src: url, alt: titel, draggable: 'false' });
  const box = el('div', { class: 'foto-gross' }, img); let z = 1, px = 0, py = 0, zieh = null; const punkte = new Map(); let pinch = null;
  const setz = () => { img.style.transform = `translate(${px}px, ${py}px) scale(${z})`; };
  const zoom = (f, cx, cy) => { const r = box.getBoundingClientRect(); cx = (cx ?? r.left + r.width / 2) - r.left - r.width / 2; cy = (cy ?? r.top + r.height / 2) - r.top - r.height / 2; const nz = Math.min(12, Math.max(1, z * f)); px = cx - (cx - px) * nz / z; py = cy - (cy - py) * nz / z; z = nz; if (z === 1) { px = py = 0; } setz(); };
  box.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY); }, { passive: false });
  box.addEventListener('dblclick', (e) => zoom(z > 1.5 ? 1 / z : 3, e.clientX, e.clientY));
  box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); punkte.set(e.pointerId, [e.clientX, e.clientY]); if (punkte.size === 1) zieh = { x: e.clientX - px, y: e.clientY - py }; else { const [a, b] = [...punkte.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  box.addEventListener('pointermove', (e) => {
    if (!punkte.has(e.pointerId)) return; punkte.set(e.pointerId, [e.clientX, e.clientY]);
    if (punkte.size === 2 && pinch) { const [a, b] = [...punkte.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; }
    else if (zieh && z > 1) { px = e.clientX - zieh.x; py = e.clientY - zieh.y; setz(); }
  });
  const los = (e) => { punkte.delete(e.pointerId); if (punkte.size < 2) pinch = null; if (!punkte.size) zieh = null; };
  box.addEventListener('pointerup', los); box.addEventListener('pointercancel', los);
  const leiste = el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', onclick: () => zoom(1 / 1.5) }, '−'), el('button', { class: 'btn klein', onclick: () => zoom(1.5) }, '+'), el('button', { class: 'btn klein', onclick: () => { z = 1; px = py = 0; setz(); } }, tr('Einpassen')),
    el('span', { class: 'hinweis' }, tr('Mausrad oder zwei Finger = zoomen, ziehen = verschieben, Doppelklick = 3×')));
  await modal({ titel: titel || tr('Foto'), inhalt: el('div', {}, leiste, box), breit: true, klasse: 'foto-mdl', knoepfe: [{ text: tr('Schließen'), wert: null }] });
  URL.revokeObjectURL(url);
}
