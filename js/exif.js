// TW Bildstudio – EXIF lesen (Aufnahmedatum, Kamera …), Copyright/Urheber in JPEG schreiben, RAW-Vorschau holen
import { tr, trz, zahl } from './i18n.js';
const TAGS = { 0x010f: 'kamera_hersteller', 0x0110: 'kamera', 0x0112: 'orientierung', 0x0132: 'datum', 0x9003: 'aufnahme', 0x829a: 'belichtung', 0x829d: 'blende', 0x8827: 'iso', 0x920a: 'brennweite', 0xa434: 'objektiv', 0x013b: 'urheber', 0x8298: 'copyright', 0x010e: 'beschreibung', 0xa002: 'breite', 0xa003: 'hoehe', 0x8825: 'gps' };

function leseIFDs(dv, tiff, le, start, ziel, tiefe = 0) {
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  let off = start, n = 0;
  while (off && off + 2 < dv.byteLength && n++ < 6 && tiefe < 4) {
    const cnt = u16(tiff + off); const jpeg = {};
    for (let i = 0; i < cnt; i++) {
      const e = tiff + off + 2 + i * 12; if (e + 12 > dv.byteLength) break;
      const tag = u16(e), typ = u16(e + 2), anz = u32(e + 4), vo = e + 8;
      const groesse = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][typ] || 1; const p = groesse * anz > 4 ? tiff + u32(vo) : vo;
      const wert = () => {
        if (p + groesse * anz > dv.byteLength) return null;
        if (typ === 2) { let s = ''; for (let k = 0; k < anz - 1; k++) s += String.fromCharCode(dv.getUint8(p + k)); return s.replace(/\0+$/, '').trim(); }
        if (typ === 3) return u16(p); if (typ === 4) return u32(p);
        if (typ === 5) return u32(p) / (u32(p + 4) || 1); if (typ === 10) return dv.getInt32(p, le) / (dv.getInt32(p + 4, le) || 1);
        return null;
      };
      if (tag === 0x8769 || tag === 0x014a) { // Exif-IFD / SubIFDs
        if (tag === 0x014a && anz > 1) { for (let k = 0; k < anz; k++) leseIFDs(dv, tiff, le, u32(p + k * 4), ziel, tiefe + 1); }
        else leseIFDs(dv, tiff, le, u32(vo), ziel, tiefe + 1);
        continue;
      }
      if (tag === 0x0201) jpeg.off = u32(vo); else if (tag === 0x0202) jpeg.len = u32(vo); else if (tag === 0x0111 && typ === 4 && anz === 1) jpeg.strip = u32(vo); else if (tag === 0x0117 && anz === 1) jpeg.stripLen = typ === 3 ? u16(vo) : u32(vo); else if (tag === 0x0103) jpeg.komp = u16(vo);
      const name = TAGS[tag]; if (name && ziel[name] == null) { const v = wert(); if (v != null && v !== '') ziel[name] = v; }
    }
    if (jpeg.off && jpeg.len) (ziel._jpegs ||= []).push({ off: tiff + jpeg.off, len: jpeg.len });
    if ((jpeg.komp === 7 || jpeg.komp === 6) && jpeg.strip && jpeg.stripLen) (ziel._jpegs ||= []).push({ off: tiff + jpeg.strip, len: jpeg.stripLen });
    off = u32(tiff + off + 2 + cnt * 12);
  }
}
function leseTiff(dv, tiff) {
  const le = dv.getUint16(tiff) === 0x4949; const out = {};
  leseIFDs(dv, tiff, le, dv.getUint32(tiff + 4, le), out); return out;
}
/** EXIF aus Datei (JPEG oder TIFF-basiertes RAW) – liest nur den Anfang der Datei */
export async function exifLesen(file) {
  try {
    const buf = await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer(); const dv = new DataView(buf);
    if (dv.getUint16(0) === 0xffd8) {
      let o = 2; while (o + 4 < dv.byteLength) { const m = dv.getUint16(o), l = dv.getUint16(o + 2); if (m === 0xffe1 && dv.getUint32(o + 4) === 0x45786966) return aufbereiten(leseTiff(dv, o + 10)); if ((m & 0xff00) !== 0xff00) break; o += 2 + l; }
      return {};
    }
    const b = dv.getUint16(0); if (b === 0x4949 || b === 0x4d4d) return aufbereiten(leseTiff(dv, 0));
  } catch (e) { console.warn('EXIF', e); }
  return {};
}
function aufbereiten(x) {
  const d = (s) => { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null; };
  const out = { ...x }; delete out._jpegs; out.aufnahmeZeit = d(x.aufnahme) || d(x.datum) || null; out.hatGPS = !!x.gps; delete out.gps;
  if (x.belichtung) out.belichtung = x.belichtung >= 1 ? x.belichtung + ' s' : '1/' + Math.round(1 / x.belichtung) + ' s';
  if (x.blende) out.blende = 'f/' + zahl(+x.blende);
  if (x.brennweite) out.brennweite = Math.round(x.brennweite) + ' mm';
  return out;
}
const RAW = /\.(cr2|nef|nrw|arw|srf|sr2|dng|orf|pef|rw2|raf|3fr|erf|kdc|mrw|srw|x3f|iiq)$/i;
export const istRaw = (name) => RAW.test(name || '');
/** größtes eingebettetes JPEG aus einer RAW-Datei (Kamera-Vorschau, meist volle Auflösung) */
export async function rawVorschau(file) {
  const buf = await file.arrayBuffer(); const dv = new DataView(buf); let liste = [];
  const b = dv.getUint16(0);
  if (b === 0x4949 || b === 0x4d4d) { const x = {}; leseIFDs(dv, 0, b === 0x4949, dv.getUint32(4, b === 0x4949), x); liste = x._jpegs || []; }
  if (/\.raf$/i.test(file.name)) { const off = dv.getUint32(84), len = dv.getUint32(88); liste.push({ off, len }); }
  liste = liste.filter(j => j.off > 0 && j.len > 1000 && j.off + j.len <= buf.byteLength && dv.getUint16(j.off) === 0xffd8).sort((a, b) => b.len - a.len);
  if (!liste.length) { // Notlösung: größtes JPEG per Marker-Suche
    const u = new Uint8Array(buf); let start = -1, bestS = 0, bestL = 0;
    for (let i = 0; i < u.length - 3; i++) { if (u[i] === 0xff && u[i + 1] === 0xd8 && u[i + 2] === 0xff) start = i; else if (start >= 0 && u[i] === 0xff && u[i + 1] === 0xd9) { if (i - start > bestL) { bestL = i - start + 2; bestS = start; } start = -1; } }
    if (bestL > 10000) liste = [{ off: bestS, len: bestL }];
  }
  if (!liste.length) throw new Error(tr('In dieser RAW-Datei ist keine Vorschau enthalten.'));
  return new Blob([buf.slice(liste[0].off, liste[0].off + liste[0].len)], { type: 'image/jpeg' });
}

/* ───────── EXIF schreiben (Urheber, Copyright, Beschreibung, Software, Datum) ───────── */
function asciiBytes(s) { s = String(s).replace(/©/g, '(c)').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?'); const e = new TextEncoder().encode(s); const out = new Uint8Array(e.length + 1); out.set(e); return out; }
/** baut einen APP1-Block (big endian) */
function exifBlock(felder) {
  const eintraege = [];
  const add = (tag, s) => { if (s) eintraege.push({ tag, data: asciiBytes(s) }); };
  add(0x010e, felder.beschreibung); add(0x0131, felder.software); add(0x0132, felder.datum); add(0x013b, felder.urheber); add(0x8298, felder.copyright);
  eintraege.sort((a, b) => a.tag - b.tag);
  const n = eintraege.length, ifdLen = 2 + n * 12 + 4; let datenOff = 8 + ifdLen;
  const teile = []; let datenLen = 0; for (const e of eintraege) if (e.data.length > 4) { datenLen += e.data.length + (e.data.length & 1); }
  const tiff = new Uint8Array(8 + ifdLen + datenLen); const dv = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]); dv.setUint16(8, n);
  eintraege.forEach((e, i) => {
    const o = 10 + i * 12; dv.setUint16(o, e.tag); dv.setUint16(o + 2, 2); dv.setUint32(o + 4, e.data.length);
    if (e.data.length <= 4) tiff.set(e.data, o + 8); else { dv.setUint32(o + 8, datenOff); tiff.set(e.data, datenOff); datenOff += e.data.length + (e.data.length & 1); }
  });
  dv.setUint32(10 + n * 12, 0);
  const kopf = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]); const len = 2 + kopf.length + tiff.length;
  const app1 = new Uint8Array(4 + kopf.length + tiff.length); app1.set([0xff, 0xe1, len >> 8, len & 255]); app1.set(kopf, 4); app1.set(tiff, 10);
  void teile; return app1;
}
/** EXIF-Block in ein JPEG einsetzen (direkt nach SOI bzw. nach JFIF-APP0) */
export async function exifEinsetzen(jpegBlob, felder) {
  if (!felder || !Object.values(felder).some(Boolean)) return jpegBlob;
  const u = new Uint8Array(await jpegBlob.arrayBuffer()); if (u[0] !== 0xff || u[1] !== 0xd8) return jpegBlob;
  let pos = 2; if (u[2] === 0xff && u[3] === 0xe0) pos = 4 + ((u[4] << 8) | u[5]);
  const app1 = exifBlock(felder); if (app1.length > 65000) return jpegBlob;
  return new Blob([u.slice(0, pos), app1, u.slice(pos)], { type: 'image/jpeg' });
}
export const exifDatum = (t) => { const d = new Date(t || Date.now()), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
