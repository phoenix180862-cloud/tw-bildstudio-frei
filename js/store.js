// TW Bildstudio – Bibliothek: Bilder, Ordner, Einstellungen, Import, Vorschaubilder
import * as db from './db.js';
import { uid, toast } from './util.js';
import { rendern, istBearbeitet, normalisiereBearbeitung } from './engine.js';
import { exifLesen, istRaw, rawVorschau } from './exif.js';
import { tr, trz } from './i18n.js';

export const state = { recs: new Map(), ordner: [], einst: {}, auswahl: new Set(), fokus: null, ansicht: 'alle', filter: { sterne: 0, farbe: '', flag: '', suche: '', quelle: '' }, sort: 'aufnahme', sortAb: true };
const hoerer = {};
export const on = (ev, fn) => (hoerer[ev] ||= []).push(fn);
export const emit = (ev, d) => (hoerer[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });

// kostenlose Fassung (frei-config.js): keine Firmen-Vorbelegung für Urheber, Copyright und Wasserzeichen
const FREI = !!window.TW_FREI;
export const EINST_DEFAULT = {
  urheber: FREI ? '' : 'Thomas Willwacher', copyright: FREI ? '' : '© Thomas Willwacher Fliesenlegermeister e.K.',
  wz: { an: false, art: 'text', text: FREI ? '' : '© Thomas Willwacher Fliesenlegermeister e.K.', logo: null, pos: 'ur', groesse: 4, deckkraft: 70, rand: 3, farbe: '#ffffff', schatten: true, kachel: false, schrift: 'Oswald' },
  kachel: 190, eigeneLooks: [], exportVorgaben: [], letzterExport: null, zuletztKopiert: null, importOrdnerName: '', hinweiseGesehen: {}
};
export async function init() {
  const recs = await db.alle('recs'); for (const r of recs) state.recs.set(r.id, r);
  state.ordner = (await db.get('kv', 'ordner')) || [];
  state.einst = { ...EINST_DEFAULT, ...((await db.get('kv', 'einst')) || {}) }; state.einst.wz = { ...EINST_DEFAULT.wz, ...(state.einst.wz || {}) };
  const ui = (await db.get('kv', 'ui')) || {}; Object.assign(state, { sort: ui.sort || 'aufnahme', sortAb: ui.sortAb ?? true });
  db.dauerhaft();
}
export const einstSpeichern = () => db.put('kv', 'einst', state.einst);
export const uiSpeichern = () => db.put('kv', 'ui', { sort: state.sort, sortAb: state.sortAb });
export const ordnerSpeichern = () => { emit('ordner'); return db.put('kv', 'ordner', state.ordner); };
export async function recSpeichern(r) { r.geaendert = Date.now(); state.recs.set(r.id, r); await db.put('recs', r.id, r); emit('rec', r); }
export async function recsSpeichern(liste) { const t = Date.now(); for (const r of liste) { r.geaendert = t; state.recs.set(r.id, r); } await db.putViele('recs', liste.map(r => [r.id, r])); emit('recs', liste); }

/* ───────── Ordner ───────── */
const FARBEN = ['#e5484d', '#f08c2a', '#e9cc2a', '#3fb950', '#2ec4c6', '#3b82f6', '#9b5de5', '#e04fb3', '#94a3b8'];
export function ordnerNeu(name) {
  const benutzt = new Set(state.ordner.map(o => o.taste)); let taste = null; for (let i = 1; i <= 9; i++) if (!benutzt.has(i)) { taste = i; break; }
  const o = { id: uid(), name: name || tr('Neuer Ordner'), farbe: FARBEN[state.ordner.length % FARBEN.length], taste, erstellt: Date.now() };
  state.ordner.push(o); ordnerSpeichern(); return o;
}
export const ordner = (id) => state.ordner.find(o => o.id === id);
export const ordnerPerTaste = (n) => state.ordner.find(o => o.taste === n);
export async function ordnerLoeschen(id) {
  state.ordner = state.ordner.filter(o => o.id !== id);
  const betroffen = [...state.recs.values()].filter(r => r.ordner === id); for (const r of betroffen) r.ordner = null;
  await recsSpeichern(betroffen); await ordnerSpeichern();
}
export async function einsortieren(ids, ordnerId) {
  const liste = [...ids].map(id => state.recs.get(id)).filter(Boolean); for (const r of liste) r.ordner = ordnerId || null;
  await recsSpeichern(liste); emit('ordner');
}
export async function setzen(ids, feld, wert) {
  const liste = [...ids].map(id => state.recs.get(id)).filter(Boolean); for (const r of liste) r[feld] = wert; await recsSpeichern(liste);
}
export async function entfernen(ids) {
  const k = [...ids]; for (const id of k) { state.recs.delete(id); state.auswahl.delete(id); thumbFrei(id); bmpCache.delete(id); }
  await db.delViele('recs', k); await db.delViele('blobs', k); await db.delViele('thumbs', k); emit('recs', []); emit('ordner');
}

/* ───────── Liste (Ansicht, Filter, Sortierung) ───────── */
export function sichtbareListe() {
  const f = state.filter, q = (f.suche || '').toLowerCase().trim();
  let l = [...state.recs.values()];
  const v = state.ansicht;
  if (v === 'unsortiert') l = l.filter(r => !r.ordner); else if (v === 'favoriten') l = l.filter(r => r.flag === 1 || (r.sterne || 0) >= 4);
  else if (v === 'bearbeitet') l = l.filter(r => istBearbeitet(r.edit)); else if (v === 'abgelehnt') l = l.filter(r => r.flag === -1);
  else if (v.startsWith('ordner:')) l = l.filter(r => r.ordner === v.slice(7));
  if (v !== 'abgelehnt' && f.flag !== 'abgelehnt') l = l.filter(r => r.flag !== -1 || v.startsWith('ordner:'));
  if (f.sterne) l = l.filter(r => (r.sterne || 0) >= f.sterne);
  if (f.farbe) l = l.filter(r => r.farbe === f.farbe);
  if (f.flag === 'markiert') l = l.filter(r => r.flag === 1);
  if (f.quelle) l = l.filter(r => r.quelle === f.quelle);
  if (q) l = l.filter(r => (r.name + ' ' + (r.titel || '') + ' ' + (r.stichworte || []).join(' ') + ' ' + (ordner(r.ordner)?.name || '') + ' ' + (r.exif?.kamera || '')).toLowerCase().includes(q));
  const s = state.sort, dir = state.sortAb ? -1 : 1;
  const key = { aufnahme: r => r.aufnahme || r.importiert, import: r => r.importiert, name: r => r.name.toLowerCase(), sterne: r => (r.sterne || 0) * 1e13 + (r.aufnahme || 0), groesse: r => r.bytes || 0, geaendert: r => r.geaendert || 0 }[s] || (r => r.aufnahme);
  l.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.name.localeCompare(b.name); });
  return l;
}
export function zaehler() {
  const all = [...state.recs.values()], z = { alle: 0, unsortiert: 0, favoriten: 0, bearbeitet: 0, abgelehnt: 0, ordner: {} };
  for (const r of all) {
    if (r.flag === -1) { z.abgelehnt++; } else { z.alle++; if (!r.ordner) z.unsortiert++; }
    if (r.flag === 1 || (r.sterne || 0) >= 4) z.favoriten++; if (r.edit && istBearbeitet(r.edit)) z.bearbeitet++;
    if (r.ordner) z.ordner[r.ordner] = (z.ordner[r.ordner] || 0) + 1;
  }
  return z;
}

/* ───────── Originale & Vorschaubilder ───────── */
const bmpCache = new Map();
export async function original(id) { return db.get('blobs', id); }
export async function bitmap(rec) {
  if (bmpCache.has(rec.id)) { const b = bmpCache.get(rec.id); bmpCache.delete(rec.id); bmpCache.set(rec.id, b); return b; }
  const blob = await original(rec.id); if (!blob) throw new Error(tr('Original nicht gefunden: ') + rec.name);
  const b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  bmpCache.set(rec.id, b); while (bmpCache.size > 3) { const [k, v] = bmpCache.entries().next().value; v.close?.(); bmpCache.delete(k); }
  return b;
}
const thumbUrls = new Map();
export async function thumbUrl(rec) {
  const k = rec.id + ':' + (rec.thumbV || 0); if (thumbUrls.has(k)) return thumbUrls.get(k);
  let b = await db.get('thumbs', rec.id); if (!b) { await thumbErzeugen(rec); b = await db.get('thumbs', rec.id); }
  if (!b) return ''; for (const [kk, u] of thumbUrls) if (kk.startsWith(rec.id + ':')) { URL.revokeObjectURL(u); thumbUrls.delete(kk); }
  const u = URL.createObjectURL(b); thumbUrls.set(k, u); return u;
}
function thumbFrei(id) { for (const [k, u] of thumbUrls) if (k.startsWith(id + ':')) { URL.revokeObjectURL(u); thumbUrls.delete(k); } }
export async function thumbErzeugen(rec, bmp) {
  const N = 480; let c;
  if (rec.edit && istBearbeitet(rec.edit)) { const b = bmp || await bitmap(rec); c = rendern(b, rec.id, rec.edit, { maxW: N, maxH: N }); }
  else {
    const b = bmp || await bitmap(rec); const f = Math.min(1, N / Math.max(b.width, b.height));
    c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.width * f)); c.height = Math.max(1, Math.round(b.height * f));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, c.width, c.height);
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); await db.put('thumbs', rec.id, blob);
  rec.thumbV = (rec.thumbV || 0) + 1; rec.tw = c.width; rec.th = c.height;
}
export async function bearbeitungSpeichern(rec, edit, { thumb = true } = {}) {
  rec.edit = istBearbeitet(edit) ? normalisiereBearbeitung(edit) : null; rec.bearbeitet = Date.now();
  if (thumb) await thumbErzeugen(rec); await recSpeichern(rec);
}

/* ───────── Import ───────── */
/** Neues Bild aus einer Fläche anlegen (z. B. KI-Ergebnis) – übernimmt Ordner/Stichwörter der Vorlage */
export async function bildHinzufuegen(blob, { name, vorlage = null, ki = null, titel = '' } = {}) {
  const bmp = await createImageBitmap(blob); const jetzt = Date.now();
  const rec = {
    id: uid(), name, typ: blob.type || 'image/jpeg', bytes: blob.size, w: bmp.width, h: bmp.height, schluessel: name + '|' + blob.size + '|' + jetzt,
    importiert: jetzt, aufnahme: vorlage?.aufnahme || jetzt, exif: vorlage?.exif ? { ...vorlage.exif } : {}, quelle: ki ? 'ki' : 'pc', quelleInfo: vorlage ? { vonId: vorlage.id, vonName: vorlage.name } : null,
    ordner: vorlage?.ordner || null, sterne: 0, farbe: '', flag: 0, titel: titel || '', stichworte: [...(vorlage?.stichworte || []), ...(ki ? ['KI'] : [])], edit: null, ki: ki || undefined
  };
  await db.put('blobs', rec.id, blob); await thumbErzeugen(rec, bmp); bmp.close?.();
  await db.put('recs', rec.id, rec); state.recs.set(rec.id, rec); emit('recs', [rec]); emit('ordner');
  return rec;
}
let heicP = null;
async function heicNachJpeg(blob) {
  if (!heicP) heicP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/heic2any.min.js'; s.onload = res; s.onerror = () => rej(new Error(tr('HEIC-Wandler nicht geladen'))); document.head.append(s); });
  await heicP; const r = await window.heic2any({ blob, toType: 'image/jpeg', quality: 0.95 }); return Array.isArray(r) ? r[0] : r;
}
const BILD = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|jfif)$/i;
export const istBild = (f) => (f.type && f.type.startsWith('image/')) || BILD.test(f.name || '') || istRaw(f.name);
/** Dateien in die Bibliothek übernehmen. opt: { quelle, ordner, quelleInfo(file) } */
export async function importieren(files, opt = {}) {
  const liste = [...files].filter(istBild); if (!liste.length) { toast(tr('Keine Bilddateien gefunden.'), 'warn'); return []; }
  const vorhanden = new Set([...state.recs.values()].map(r => r.schluessel));
  const neu = [], fehler = []; let doppelt = 0; emit('import', { laeuft: true, n: liste.length, i: 0 });
  for (let i = 0; i < liste.length; i++) {
    const f = liste[i]; const schl = (opt.schluessel?.(f)) || (f.name + '|' + f.size);
    emit('import', { laeuft: true, n: liste.length, i: i + 1, name: f.name });
    if (vorhanden.has(schl)) { doppelt++; continue; }
    try {
      let blob = f, typ = f.type || '', name = f.name || 'bild.jpg'; const exif = await exifLesen(f);
      if (istRaw(name)) { blob = await rawVorschau(f); typ = 'image/jpeg'; }
      else if (/hei[cf]$/i.test(typ) || /\.hei[cf]$/i.test(name)) { try { await createImageBitmap(f); } catch (e) { blob = await heicNachJpeg(f); typ = 'image/jpeg'; } }
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const rec = {
        id: uid(), name, typ: typ || blob.type, bytes: f.size, w: bmp.width, h: bmp.height, schluessel: schl,
        importiert: Date.now() + i, aufnahme: exif.aufnahmeZeit || f.lastModified || Date.now(), exif, quelle: opt.quelle || 'pc', quelleInfo: opt.quelleInfo?.(f) || null,
        ordner: opt.ordner || null, sterne: 0, farbe: '', flag: 0, titel: '', stichworte: [], edit: null, raw: istRaw(name) || undefined
      };
      await db.put('blobs', rec.id, blob);
      await thumbErzeugen(rec, bmp); bmp.close?.();
      await db.put('recs', rec.id, rec); state.recs.set(rec.id, rec); vorhanden.add(schl); neu.push(rec);
      if (neu.length % 6 === 0) emit('recs', neu);
    } catch (e) { console.warn(e); fehler.push(f.name + ': ' + (e.message || e)); }
  }
  emit('import', { laeuft: false }); emit('recs', neu); emit('ordner');
  const t = [trz(neu.length, '{0} Bild übernommen', '{0} Bilder übernommen')]; if (doppelt) t.push(tr('{0} schon vorhanden', doppelt)); if (fehler.length) t.push(tr('{0} nicht lesbar', fehler.length));
  toast(t.join(' · '), fehler.length ? 'warn' : 'ok', 4500); if (fehler.length) console.warn(fehler);
  return neu;
}
