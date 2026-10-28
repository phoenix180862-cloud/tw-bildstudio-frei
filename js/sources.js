// TW Bildstudio – Bilder holen: PC (Dateien/Ordner), Import-Ordner, Google Fotos, Google Drive, Baustelle, Kamera, Zwischenablage, Internet
import { state, importieren, istBild, einstSpeichern } from './store.js';
import * as drive from './drive.js';
import * as db from './db.js';
import { $, el, esc, toast, modal, fortschritt, eingabe, fmtDate } from './util.js';
import { menue } from './library.js';
import { FREI, NUR_FIRMA_QUELLEN } from './frei.js';
import { tr, trz } from './i18n.js';

const ALLE_QUELLEN = [
  { k: 'pc', i: '🖥', t: tr('Vom PC (Dateien)'), h: tr('Einzelne Bilder auswählen – oder einfach aus dem Explorer ins Fenster ziehen') },
  { k: 'pcordner', i: '🗂', t: tr('Ganzen Ordner vom PC'), h: tr('Alle Bilder eines Ordners (mit Unterordnern)') },
  { k: 'importordner', i: '⟳', t: tr('Import-Ordner prüfen'), h: tr('Fester Ordner (z. B. Downloads oder Handy-Sync) – holt nur neue Bilder') },
  { k: 'gfotos', i: '🌈', t: tr('Google Fotos'), h: tr('Bilder in Google Fotos auswählen') },
  { k: 'baustelle', i: '🏗', t: tr('Aus Baustelle (05_Bilder)'), h: tr('Baustellenfotos aus Google Drive') },
  { k: 'drive', i: '☁', t: tr('Google Drive'), h: tr('Beliebiger Ordner in Google Drive') },
  { k: 'kamera', i: '📷', t: tr('Kamera / Handy'), h: tr('Foto aufnehmen (am Handy/Tablet)') },
  { k: 'ablage', i: '📋', t: tr('Aus Zwischenablage'), h: tr('Kopiertes Bild oder Screenshot einfügen (Strg+V geht überall)') },
  { k: 'url', i: '🔗', t: tr('Aus dem Internet (Adresse)'), h: tr('Bild über seine Internetadresse laden') }
];
/** Quellen der aktuellen Fassung (kostenlose Fassung: ohne Google Fotos, Drive und Baustelle) */
export const QUELLEN = FREI ? ALLE_QUELLEN.filter(q => !NUR_FIRMA_QUELLEN.includes(q.k)) : ALLE_QUELLEN;
export function importMenue(anker) { menue(anker, QUELLEN.map(q => ({ i: q.i, t: q.t, f: () => holen(q.k) }))); }
const zielOrdner = () => state.ansicht.startsWith('ordner:') ? state.ansicht.slice(7) : null;

export async function holen(k) {
  const opt = { ordner: zielOrdner() };
  if (FREI && NUR_FIRMA_QUELLEN.includes(k)) return;
  try {
    if (k === 'pc') { const i = $('#dateiWahl'); i.value = ''; i.onchange = () => importieren(i.files, { ...opt, quelle: 'pc' }); i.click(); }
    else if (k === 'kamera') { const i = $('#kameraWahl'); i.value = ''; i.onchange = () => importieren(i.files, { ...opt, quelle: 'kamera' }); i.click(); }
    else if (k === 'pcordner') await pcOrdner(opt);
    else if (k === 'importordner') await importOrdner(opt);
    else if (k === 'gfotos') await googleFotos(opt);
    else if (k === 'drive') await driveImport(opt);
    else if (k === 'baustelle') await baustelleImport(opt);
    else if (k === 'ablage') await zwischenablage(opt);
    else if (k === 'url') await ausUrl(opt);
  } catch (e) { if (e.name === 'AbortError') return; console.error(e); toast(e.message || String(e), 'fehler', 6000); }
}

/* ───────── PC-Ordner & Import-Ordner ───────── */
async function dateienAusOrdner(handle, pfad = '', out = [], tiefe = 0) {
  for await (const [name, h] of handle.entries()) {
    if (h.kind === 'file') { if (istBild({ name, type: '' })) { const f = await h.getFile(); f._pfad = pfad + name; out.push(f); } }
    else if (tiefe < 6 && !name.startsWith('.')) await dateienAusOrdner(h, pfad + name + '/', out, tiefe + 1);
  }
  return out;
}
const fsOk = () => 'showDirectoryPicker' in window;
async function pcOrdner(opt) {
  if (!fsOk()) { toast(tr('Ordner-Auswahl geht nur in Chrome/Edge am PC. Alternative: Ordner aus dem Explorer ins Fenster ziehen.'), 'warn', 6000); return; }
  const h = await showDirectoryPicker({ id: 'bs-import', mode: 'read' }); const files = await dateienAusOrdner(h);
  if (!files.length) { toast(tr('In diesem Ordner sind keine Bilder.'), 'warn'); return; }
  importieren(files, { ...opt, quelle: 'pc', quelleInfo: (f) => ({ pfad: h.name + '/' + f._pfad }) });
}
export async function importOrdner(opt = {}, neuWaehlen = false) {
  if (!fsOk()) { toast(tr('Der Import-Ordner geht nur in Chrome/Edge am PC.'), 'warn'); return; }
  let h = neuWaehlen ? null : await db.get('kv', 'importOrdner');
  if (!h) {
    const ok = await modal({ titel: tr('Import-Ordner festlegen'), hilfe: 'import-ordner', inhalt: el('div', {}, el('p', {}, tr('Wähle einmal einen festen Ordner, in dem neue Bilder ankommen – z. B. „Downloads“, den Ordner deiner Handy-Synchronisation oder „Bilder“.')), el('p', {}, tr('Danach holt „Import-Ordner prüfen“ mit einem Klick alle Bilder, die neu dazugekommen sind. Bereits übernommene werden übersprungen.'))), knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Ordner wählen'), art: 'primaer', wert: true }] });
    if (!ok) return; h = await showDirectoryPicker({ id: 'bs-importordner', mode: 'read', startIn: 'downloads' }); await db.put('kv', 'importOrdner', h); state.einst.importOrdnerName = h.name; einstSpeichern();
  }
  if ((await h.queryPermission({ mode: 'read' })) !== 'granted' && (await h.requestPermission({ mode: 'read' })) !== 'granted') { toast(tr('Zugriff auf den Import-Ordner wurde nicht erlaubt.'), 'warn'); return; }
  const files = await dateienAusOrdner(h); const vorhanden = new Set([...state.recs.values()].map(r => r.schluessel));
  const neu = files.filter(f => !vorhanden.has(f.name + '|' + f.size));
  if (!neu.length) { toast(tr('Import-Ordner „{0}“: keine neuen Bilder.', h.name)); return; }
  importieren(neu, { ...opt, quelle: 'importordner', quelleInfo: (f) => ({ pfad: h.name + '/' + f._pfad }) });
}

/* ───────── Google Fotos ───────── */
async function googleFotos(opt) {
  const fenster = window.open('about:blank', 'gfotos', 'popup=yes,width=1100,height=800'); // im Klick öffnen (sonst Pop-up-Sperre)
  if (fenster) fenster.document.write(tr('<p style="font:16px sans-serif;padding:30px">Google Fotos wird geöffnet …</p>'));
  const p = fortschritt(tr('Google Fotos'));
  try {
    const files = await drive.fotosAuswahl(fenster, (t) => p.set(0, 1, t), () => p.abgebrochen);
    p.zu(); if (!files.length) { toast(tr('Keine Bilder aus Google Fotos ausgewählt.'), 'warn'); return; }
    importieren(files, { ...opt, quelle: 'gfotos', schluessel: (f) => 'gfotos:' + (f._gid || f.name + '|' + f.size) });
  } catch (e) {
    p.zu(); fenster?.close();
    if (e.message === 'FOTOS_API_AUS') return modal({ titel: tr('Google Fotos einmalig freischalten'), hilfe: 'google-fotos', inhalt: tr('<p>Die Google-Fotos-Auswahl ist in deinem Google-Projekt noch nicht eingeschaltet. Das ist ein einmaliger Klick:</p><ol><li>Diesen Link öffnen: <a href="{0}" target="_blank" rel="noopener">{1}</a></li><li>Auf <b>„Aktivieren“</b> klicken.</li><li>Hier nochmal „Google Fotos“ wählen.</li></ol>', e.link, e.link), knoepfe: [{ text: 'OK', art: 'primaer', wert: null }] });
    if (e.message === 'FOTOS_CORS') return modal({ titel: tr('Google Fotos: Download blockiert'), inhalt: tr('<p>Google hat das direkte Herunterladen der ausgewählten Bilder in den Browser abgelehnt.</p><p><b>So geht es trotzdem schnell:</b> In Google Fotos die Bilder markieren → oben rechts ⋮ → „Herunterladen“. Die Bilder landen in „Downloads“. Dann hier „Import-Ordner prüfen“ (Downloads als Import-Ordner festlegen) – fertig.</p>'), knoepfe: [{ text: tr('Import-Ordner einrichten'), art: 'primaer', wert: true }, { text: tr('Schließen'), wert: false }] }).then(v => v && importOrdner({}, false));
    throw e;
  }
}

/* ───────── Google Drive: Browser ───────── */
/** Drive-Browser. modus 'bilder' (Mehrfachauswahl Bilder) oder 'ordner' (Zielordner wählen). Rückgabe: Liste Dateien bzw. {id,name,pfad} */
export async function driveBrowser({ modus = 'bilder', start = null, titel, startPfad = null } = {}) {
  try { await drive.sicher(); } catch (e) { toast(e.message, 'fehler'); return null; }
  let pfad = startPfad || (start ? [{ id: start.id, name: start.name }] : [{ id: 'root', name: tr('Meine Ablage') }]);
  const gewaehlt = new Map(); let eintraege = [];
  const box = el('div'), kopf = el('div', { class: 'dv-pfad' }), info = el('div', { class: 'hinweis', style: 'margin-bottom:6px' }), raster = el('div', { class: 'dv-raster' });
  const schnell = el('div', { class: 'knopfreihe' }, ...[[tr('Meine Ablage'), 'root'], ['01_Baustellen', drive.ORDNER.baustellen], ['02_Firma', drive.ORDNER.firma], ['03_Privat', drive.ORDNER.privat]].map(([n, id]) => el('button', { class: 'btn klein', onclick: () => { pfad = [{ id: 'root', name: tr('Meine Ablage') }]; if (id !== 'root') pfad.push({ id, name: n }); lade(); } }, n)),
    modus === 'ordner' ? el('button', { class: 'btn klein', onclick: async () => { const n = await eingabe(tr('Neuer Ordner in „{0}“', pfad[pfad.length - 1].name), ''); if (!n) return; await drive.ordnerSichern(pfad[pfad.length - 1].id, n); lade(); } }, tr('＋ Neuer Ordner')) : null,
    modus === 'bilder' ? el('button', { class: 'btn klein', onclick: () => { for (const f of eintraege) if (f.mimeType !== 'application/vnd.google-apps.folder') gewaehlt.set(f.id, f); zeichne(); } }, tr('Alle Bilder hier wählen')) : null);
  box.append(schnell, kopf, info, raster);
  async function lade() {
    kopf.innerHTML = ''; pfad.forEach((p, i) => { if (i) kopf.append(el('span', {}, '›')); kopf.append(el('a', { onclick: () => { pfad = pfad.slice(0, i + 1); lade(); } }, p.name)); });
    raster.innerHTML = tr('<p class="hinweis">lädt …</p>');
    try { eintraege = await drive.inhalt(pfad[pfad.length - 1].id); } catch (e) { raster.innerHTML = tr('<p class="hinweis">{0}</p>', esc(e.message)); return; }
    zeichne();
  }
  function zeichne() {
    raster.innerHTML = ''; const ordner = eintraege.filter(f => f.mimeType === 'application/vnd.google-apps.folder'), bilder = eintraege.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    info.textContent = tr('{0} Ordner · {1} Bilder', ordner.length, bilder.length) + (modus === 'bilder' ? tr(' · {0} ausgewählt', gewaehlt.size) : '');
    for (const f of ordner) raster.append(el('div', { class: 'dv-el ordner', title: f.name, ondblclick: () => { pfad.push({ id: f.id, name: f.name }); lade(); }, onclick: () => { pfad.push({ id: f.id, name: f.name }); lade(); } }, el('div', { class: 'bx' }, '📁'), el('div', { class: 'nm' }, f.name)));
    if (modus === 'bilder') for (const f of bilder) {
      const img = f.thumbnailLink ? el('img', { src: f.thumbnailLink.replace(/=s\d+$/, '=s320'), referrerpolicy: 'no-referrer', loading: 'lazy', onerror: (e) => { e.target.replaceWith(document.createTextNode('🖼')); } }) : '🖼';
      raster.append(el('div', { class: 'dv-el' + (gewaehlt.has(f.id) ? ' an' : ''), title: `${f.name}\n${fmtDate(Date.parse(f.imageMediaMetadata?.time?.replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3') || f.createdTime))}`, onclick: (e) => { gewaehlt.has(f.id) ? gewaehlt.delete(f.id) : gewaehlt.set(f.id, f); e.currentTarget.classList.toggle('an'); info.textContent = tr('{0} Ordner · {1} Bilder · {2} ausgewählt', ordner.length, bilder.length, gewaehlt.size); } }, el('div', { class: 'bx' }, img), el('div', { class: 'nm' }, f.name)));
    }
    if (!eintraege.length) raster.append(el('p', { class: 'hinweis' }, tr('Dieser Ordner ist leer.')));
  }
  lade();
  const erg = await modal({ titel: titel || (modus === 'bilder' ? tr('Bilder aus Google Drive') : tr('Zielordner in Google Drive wählen')), inhalt: box, breit: true, hilfe: modus === 'bilder' ? 'google-drive' : 'export-drive',
    knoepfe: [{ text: tr('Abbrechen'), wert: null }, { text: modus === 'bilder' ? tr('Ausgewählte holen') : tr('Diesen Ordner nehmen'), art: 'primaer', wert: () => modus === 'bilder' ? [...gewaehlt.values()] : { id: pfad[pfad.length - 1].id, name: pfad[pfad.length - 1].name, pfad: pfad.map(p => p.name).join(' › ') } }] });
  return erg;
}
async function driveDateienImportieren(files, opt, quelle, info) {
  const p = fortschritt(tr('Bilder aus Google Drive holen')); const out = [];
  for (let i = 0; i < files.length; i++) {
    if (p.abgebrochen) break; const f = files[i]; p.set(i, files.length, `${i + 1} / ${files.length}: ${f.name}`);
    try { const b = await drive.laden(f.id); const t = Date.parse((f.imageMediaMetadata?.time || '').replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3')) || Date.parse(f.createdTime) || Date.now(); const file = new File([b], f.name, { type: b.type || f.mimeType, lastModified: t }); file._did = f.id; out.push(file); }
    catch (e) { console.warn(e); }
  }
  p.zu(); if (!out.length) return;
  importieren(out, { ...opt, quelle, schluessel: (f) => 'drive:' + f._did, quelleInfo: (f) => ({ driveId: f._did, ...info }) });
}
async function driveImport(opt) { const files = await driveBrowser({ modus: 'bilder' }); if (files?.length) driveDateienImportieren(files, opt, 'drive', {}); }

/* ───────── Baustelle ───────── */
/** Baustelle wählen (aus 01_Baustellen). Rückgabe {id,name} */
export async function baustelleWaehlen(titel = tr('Baustelle wählen')) {
  try { await drive.sicher(); } catch (e) { toast(e.message, 'fehler'); return null; }
  const box = el('div', {}, el('p', { class: 'hinweis' }, tr('lädt Baustellen aus Google Drive …'))); let liste = [], filter = '', alte = false;
  const zeichne = () => {
    box.innerHTML = ''; const such = el('input', { class: 'inp', placeholder: tr('Baustelle suchen …'), value: filter, style: 'width:100%;margin-bottom:8px', oninput: (e) => { filter = e.target.value; raster(); setTimeout(() => { const i = box.querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0); } });
    const k = el('div', { class: 'karten' }); box.append(such, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: alte, onchange: async (e) => { alte = e.target.checked; liste = await drive.baustellen(alte); zeichne(); } }), tr('auch abgeschlossene Baustellen')), k);
    function raster() { k.innerHTML = ''; for (const b of liste.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))) k.append(el('button', { class: 'karte' + (state.einst.letzteBaustelle?.id === b.id ? ' an' : ''), onclick: () => box.closest('.mdl-wrap')._zu({ id: b.id, name: b.name }) }, el('span', { class: 'ico' }, b.aktiv ? '🏗' : '📦'), el('b', {}, b.name), el('small', {}, b.aktiv ? 'aktiv' : 'abgeschlossen'))); }
    raster();
  };
  drive.baustellen(false).then(l => { liste = l; zeichne(); }).catch(e => { box.innerHTML = tr('<p class="notiz rot">{0}</p>', esc(e.message)); });
  const b = await modal({ titel, inhalt: box, breit: true, hilfe: 'baustelle', knoepfe: [{ text: tr('Abbrechen'), wert: null }] });
  if (b) { state.einst.letzteBaustelle = b; einstSpeichern(); }
  return b;
}
async function baustelleImport(opt) {
  const b = await baustelleWaehlen(tr('Fotos holen aus Baustelle …')); if (!b) return;
  const bilderId = await drive.baustellenBilderOrdner(b.id);
  const files = await driveBrowser({ modus: 'bilder', titel: tr('Fotos aus „{0}“', b.name), startPfad: [{ id: drive.ORDNER.baustellen, name: '01_Baustellen' }, { id: b.id, name: b.name }, { id: bilderId, name: drive.BILDER_UNTERORDNER }] });
  if (files?.length) driveDateienImportieren(files, opt, 'baustelle', { baustelle: b.name, baustelleId: b.id });
}

/* ───────── Zwischenablage & Internet ───────── */
export async function zwischenablage(opt = {}) {
  try {
    const items = await navigator.clipboard.read(); const files = [];
    for (const it of items) for (const t of it.types) if (t.startsWith('image/')) { const b = await it.getType(t); files.push(new File([b], tr('Zwischenablage_{0}.{1}', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), t.split('/')[1]), { type: t, lastModified: Date.now() })); }
    if (!files.length) { toast(tr('In der Zwischenablage ist kein Bild.'), 'warn'); return; }
    importieren(files, { ...opt, quelle: 'ablage' });
  } catch (e) { toast(tr('Bitte einfach Strg+V im Fenster drücken.'), 'warn'); }
}
async function ausUrl(opt) {
  const u = await eingabe(tr('Bild aus dem Internet'), 'https://', tr('Internetadresse des Bildes (Rechtsklick auf ein Bild → „Bildadresse kopieren“)')); if (!u || u === 'https://') return;
  try { const r = await fetch(u); if (!r.ok) throw new Error(r.status); const b = await r.blob(); if (!b.type.startsWith('image/')) throw new Error(tr('kein Bild')); const name = decodeURIComponent(u.split('/').pop().split('?')[0] || 'internet.jpg'); importieren([new File([b], name, { type: b.type })], { ...opt, quelle: 'url', quelleInfo: () => ({ url: u }) }); }
  catch (e) { toast(tr('Die Seite erlaubt das direkte Laden nicht. Bild stattdessen speichern und hier hineinziehen.'), 'warn', 6000); }
}
/** Ziehen & Ablegen aus dem Explorer (Dateien und Ordner) */
export async function dropDateien(dt) {
  const files = [];
  const lies = async (entry, pfad = '') => {
    if (!entry) return;
    if (entry.isFile) { const f = await new Promise((r, j) => entry.file(r, j)); if (istBild(f)) files.push(f); }
    else if (entry.isDirectory) { const rd = entry.createReader(); let teil; do { teil = await new Promise((r, j) => rd.readEntries(r, j)); for (const e of teil) await lies(e, pfad + entry.name + '/'); } while (teil.length); }
  };
  const eintraege = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (eintraege.length) for (const e of eintraege) await lies(e); else files.push(...[...dt.files].filter(istBild));
  if (files.length) importieren(files, { ordner: zielOrdner(), quelle: 'pc' }); else toast(tr('Keine Bilder erkannt.'), 'warn');
}
