// TW Bildstudio – Bibliothek: Raster, Auswahl, Bewerten, Einsortieren, Sichten (Vollbild)
import { state, on, emit, sichtbareListe, thumbUrl, einsortieren, setzen, entfernen, ordner, ordnerPerTaste, uiSpeichern, einstSpeichern, original, bitmap } from './store.js';
import { $, $$, el, esc, toast, bestaetigen, fmtBytes, fmtDate, rafThrottle } from './util.js';
import { istBearbeitet, rendern } from './engine.js';
import { FREI } from './frei.js';
import { tr, trz } from './i18n.js';

const FARBEN = [['rot', '#e5484d'], ['gelb', '#e9cc2a'], ['gruen', '#3fb950'], ['blau', '#3b82f6'], ['lila', '#9b5de5']];
const FARBNAME = { rot: tr('Rot'), gelb: tr('Gelb'), gruen: tr('Grün'), blau: tr('Blau'), lila: tr('Lila') };
export const farbWert = (k) => (FARBEN.find(f => f[0] === k) || [])[1] || '';
let wurzel = null, liste = [], io = null;

export const sichtenStart = (...a) => sichten(...a);
export function zeigen(root) {
  wurzel = root; root.innerHTML = ''; root.dataset.hilfeOrt = '';
  const titel = ansichtTitel();
  const sterne = el('div', { class: 'sterne-filter', title: tr('Mindest-Bewertung (nochmal klicken = aus)') }, ...[1, 2, 3, 4, 5].map(n => el('button', { class: state.filter.sterne >= n ? 'an' : '', onclick: () => { state.filter.sterne = state.filter.sterne === n ? 0 : n; zeigen(root); } }, '★')));
  const farben = el('div', { class: 'farb-filter', title: tr('Nach Farbmarkierung filtern') }, ...FARBEN.map(([k, c]) => el('button', { class: state.filter.farbe === k ? 'an' : '', style: { background: c }, title: FARBNAME[k], onclick: () => { state.filter.farbe = state.filter.farbe === k ? '' : k; zeigen(root); } })));
  const sort = el('select', { class: 'inp', title: tr('Sortieren'), onchange: (e) => { state.sort = e.target.value; uiSpeichern(); neuZeichnen(); } },
    ...[['aufnahme', tr('Aufnahmedatum')], ['import', tr('Importdatum')], ['name', tr('Dateiname')], ['sterne', tr('Bewertung')], ['groesse', tr('Dateigröße')], ['geaendert', tr('Zuletzt geändert')]].map(([v, t]) => el('option', { value: v, selected: state.sort === v }, t)));
  const richtung = el('button', { class: 'ib', title: tr('Reihenfolge umdrehen'), onclick: () => { state.sortAb = !state.sortAb; uiSpeichern(); zeigen(root); } }, state.sortAb ? '↓' : '↑');
  const groesse = el('input', { type: 'range', min: 110, max: 360, value: state.einst.kachel || 190, title: tr('Vorschaugröße'), style: 'width:100px', oninput: (e) => { $('#raster').style.setProperty('--k', e.target.value + 'px'); state.einst.kachel = +e.target.value; }, onchange: () => einstSpeichern() });
  root.append(
    el('div', { class: 'leiste' },
      el('button', { class: 'ib nur-handy', onclick: () => document.body.classList.toggle('seite-auf') }, '☰'),
      el('h2', {}, titel), el('span', { class: 'anz', id: 'anz' }),
      el('span', { class: 'platz' }),
      sterne, farben,
      el('span', { class: 'hinweis' }, tr('Sortieren:')), sort, richtung, groesse,
      el('button', { class: 'btn', title: tr('Vollbild: Bild für Bild ansehen und mit den Zifferntasten in Ordner sortieren (Leertaste)'), onclick: () => sichten() }, tr('⛶ Sichten & Sortieren'))),
    el('div', { id: 'raster', tabindex: 0, style: `--k:${state.einst.kachel || 190}px` }),
    el('div', { id: 'aktionen' })
  );
  const raster = $('#raster');
  raster.addEventListener('click', klick); raster.addEventListener('dblclick', (e) => { const k = e.target.closest('.kachel'); if (k) location.hash = '#/bearbeiten/' + k.dataset.id; });
  raster.addEventListener('contextmenu', kontext);
  raster.addEventListener('dragstart', ziehStart);
  raster.addEventListener('pointerdown', (e) => { const k = e.target.closest('.kachel'); if (k) vorbereitenZiehen(k.dataset.id); });
  io = new IntersectionObserver((ents) => { for (const en of ents) if (en.isIntersecting) { ladeThumb(en.target); io.unobserve(en.target); } }, { root: raster, rootMargin: '400px' });
  neuZeichnen();
}
function ansichtTitel() {
  const v = state.ansicht; if (v.startsWith('ordner:')) return '📁 ' + (ordner(v.slice(7))?.name || tr('Ordner'));
  return { alle: tr('Alle Bilder'), unsortiert: tr('Unsortiert'), favoriten: tr('Favoriten'), bearbeitet: tr('Bearbeitet'), abgelehnt: tr('Abgelehnt') }[v] || tr('Bilder');
}
export function neuZeichnen() {
  if (!wurzel || !document.body.contains(wurzel)) return; const raster = $('#raster'); if (!raster) return;
  const st = raster.scrollTop; liste = sichtbareListe(); raster.innerHTML = '';
  $('#anz').textContent = trz(liste.length, '{0} Bild', '{0} Bilder');
  if (!liste.length) { raster.append(leer()); aktionen(); return; }
  const frag = document.createDocumentFragment();
  for (const r of liste) frag.append(kachel(r));
  raster.append(frag); raster.scrollTop = st; for (const k of $$('.kachel', raster)) io.observe(k); aktionen();
}
function leer() {
  const alle = state.recs.size;
  if (alle && state.ansicht !== 'alle') return el('div', { class: 'leer-box' }, el('h2', {}, tr('Hier ist noch nichts drin')), el('p', {}, state.ansicht.startsWith('ordner:') ? tr('Zieh Bilder auf diesen Ordner links oder markiere Bilder und drück die Taste des Ordners.') : tr('Keine Bilder passen zu dieser Ansicht bzw. diesem Filter.')));
  return el('div', { class: 'leer-box' }, el('h2', {}, tr('Willkommen im TW Bildstudio')),
    el('p', {}, FREI ? tr('Hol dir Bilder rein – vom PC, aus einem ganzen Ordner oder mit der Kamera. Oder zieh sie einfach aus dem Explorer hier ins Fenster.') : tr('Hol dir Bilder rein – vom PC, aus Google Fotos, aus Google Drive oder direkt aus dem Baustellenordner. Oder zieh sie einfach aus dem Explorer hier ins Fenster.')),
    FREI ? el('div', { class: 'zeile' },
      el('button', { class: 'btn primaer gross', onclick: () => window.BS.import('pc') }, tr('🖥 Vom PC')),
      el('button', { class: 'btn gross', onclick: () => window.BS.import('pcordner') }, tr('🗂 Ganzer Ordner')),
      el('button', { class: 'btn gross', onclick: () => window.BS.import('kamera') }, tr('📷 Kamera'))) :
    el('div', { class: 'zeile' },
      el('button', { class: 'btn primaer gross', onclick: () => window.BS.import('pc') }, tr('🖥 Vom PC')),
      el('button', { class: 'btn gross', onclick: () => window.BS.import('gfotos') }, tr('🌈 Google Fotos')),
      el('button', { class: 'btn gross', onclick: () => window.BS.import('baustelle') }, tr('🏗 Baustelle')),
      el('button', { class: 'btn gross', onclick: () => window.BS.import('drive') }, tr('☁ Google Drive'))),
    el('p', { class: 'hinweis', style: 'margin-top:22px' }, tr('Tipp: Unten rechts der gelbe Knopf „Info – so geht’s“ zeigt zu jedem Schritt ein kurzes Video.')));
}
function kachel(r) {
  const o = ordner(r.ordner);
  const k = el('div', { class: 'kachel' + (state.auswahl.has(r.id) ? ' aus' : '') + (state.fokus === r.id ? ' fokus' : '') + (r.sterne || r.farbe || r.flag ? ' hat' : '') + (r.flag === -1 ? ' abgelehnt' : ''), draggable: 'true', dataset: { id: r.id }, title: r.name },
    el('img', { alt: '', loading: 'lazy' }),
    r.farbe ? el('span', { class: 'farbe', style: { background: farbWert(r.farbe) } }) : null,
    o && !state.ansicht.startsWith('ordner:') ? el('span', { class: 'badge b-ord', style: { borderLeft: '3px solid ' + o.farbe } }, o.name) : null,
    istBearbeitet(r.edit) ? el('span', { class: 'badge b-edit', title: tr('bearbeitet') }, '✎') : null,
    r.ki ? el('span', { class: 'badge b-ki', title: tr('KI-bearbeitet: ') + (r.ki.art || '') + tr(' – nicht als Beweisfoto verwenden') }, 'KI') : null,
    r.flag === 1 ? el('span', { class: 'badge b-flag', title: tr('markiert (P)') }, '⚑') : r.flag === -1 ? el('span', { class: 'badge b-flag', title: tr('abgelehnt (X)'), style: 'color:#ff8080' }, '✕') : null,
    el('div', { class: 'info' }, el('span', { class: 'nm' }, r.name), r.sterne ? el('span', { class: 'st' }, '★'.repeat(r.sterne)) : null));
  return k;
}
async function ladeThumb(k) { const r = state.recs.get(k.dataset.id); if (!r) return; const u = await thumbUrl(r); const img = k.querySelector('img'); if (img && u) img.src = u; }
function kachelAktualisieren(id) {
  const alt = wurzel && $(`.kachel[data-id="${id}"]`, wurzel); const r = state.recs.get(id); if (!alt || !r) return;
  const neu = kachel(r); alt.replaceWith(neu); ladeThumb(neu);
}
function auswahlAnzeigen() { for (const k of $$('.kachel', wurzel)) { k.classList.toggle('aus', state.auswahl.has(k.dataset.id)); k.classList.toggle('fokus', state.fokus === k.dataset.id); } aktionen(); }
function klick(e) {
  const k = e.target.closest('.kachel'); if (!k) { if (e.target.id === 'raster') { state.auswahl.clear(); auswahlAnzeigen(); } return; }
  const id = k.dataset.id;
  if (e.shiftKey && state.fokus) { const a = liste.findIndex(r => r.id === state.fokus), b = liste.findIndex(r => r.id === id); const [x, y] = a < b ? [a, b] : [b, a]; if (!e.ctrlKey && !e.metaKey) state.auswahl.clear(); for (let i = x; i <= y; i++) state.auswahl.add(liste[i].id); }
  else if (e.ctrlKey || e.metaKey) { state.auswahl.has(id) ? state.auswahl.delete(id) : state.auswahl.add(id); state.fokus = id; }
  else { state.auswahl.clear(); state.auswahl.add(id); state.fokus = id; }
  auswahlAnzeigen(); $('#raster').focus({ preventScroll: true });
}
export const auswahlIds = () => state.auswahl.size ? [...state.auswahl] : state.fokus ? [state.fokus] : [];
function aktionen() {
  const box = $('#aktionen'); if (!box) return; const n = state.auswahl.size; box.classList.toggle('an', n > 0); box.innerHTML = ''; if (!n) return;
  box.append(el('b', {}, tr('{0} ausgewählt', n)),
    el('button', { class: 'btn', onclick: (e) => ordnerMenue(e.currentTarget) }, tr('📁 In Ordner …')),
    el('button', { class: 'btn', onclick: (e) => bewertungsMenue(e.currentTarget) }, tr('★ Bewerten')),
    el('button', { class: 'btn', onclick: () => { location.hash = '#/bearbeiten/' + auswahlIds()[0]; } }, tr('✎ Bearbeiten')),
    el('button', { class: 'btn gruen', title: tr('Jedes gewählte Bild prüfen und automatisch verbessern (Schärfe, Rauschen, Licht, Farbe, Ausrichtung)'), onclick: () => window.BS.autoVerbessern(auswahlIds()) }, tr('✨ Auto verbessern')),
    state.einst.zuletztKopiert ? el('button', { class: 'btn', title: tr('Bearbeitung des kopierten Bildes auf die Auswahl übertragen (Strg+Umschalt+V)'), onclick: () => window.BS.einfuegen(auswahlIds()) }, tr('⎘ Bearbeitung einfügen')) : null,
    el('button', { class: 'btn primaer', onclick: () => window.BS.export(auswahlIds()) }, tr('⇪ Exportieren')),
    el('button', { class: 'btn', onclick: () => window.BS.versand(auswahlIds()) }, FREI ? tr('📤 Teilen') : tr('✉ Versenden')),
    el('button', { class: 'btn', onclick: () => window.BS.drucken(auswahlIds()) }, tr('🖨 Drucken')),
    el('span', { class: 'platz' }),
    el('button', { class: 'btn', onclick: () => { state.auswahl = new Set(liste.map(r => r.id)); auswahlAnzeigen(); } }, tr('Alle')),
    el('button', { class: 'btn', onclick: () => { state.auswahl.clear(); auswahlAnzeigen(); } }, tr('Auswahl aufheben')),
    el('button', { class: 'btn', title: FREI ? tr('Aus dem Bildstudio entfernen (die Dateien auf PC/Handy bleiben unberührt)') : tr('Aus dem Bildstudio entfernen (Google Fotos/Drive bleiben unberührt)'), onclick: () => wegnehmen(auswahlIds()) }, '🗑'));
}
async function wegnehmen(ids) {
  if (!ids.length) return;
  if (!await bestaetigen(FREI ? tr('{0} Bild(er) aus dem Bildstudio entfernen? Die Originale auf deinem PC bzw. Handy bleiben unberührt. Bearbeitungen dieser Bilder gehen verloren.', ids.length) : tr('{0} Bild(er) aus dem Bildstudio entfernen? Die Originale in Google Fotos, Drive oder auf dem PC bleiben unberührt. Bearbeitungen dieser Bilder gehen verloren.', ids.length), tr('Entfernen'), tr('Entfernen'))) return;
  await entfernen(ids); toast(tr('{0} Bild(er) entfernt', ids.length)); neuZeichnen();
}

/* ───────── Menüs ───────── */
export function menue(anker, eintraege, pos) {
  document.querySelector('.menue')?.remove();
  const m = el('div', { class: 'menue' });
  for (const e of eintraege) { if (e === '-') { m.append(el('hr')); continue; } m.append(el('button', { onclick: () => { m.remove(); e.f(); } }, e.dot ? el('span', { class: 'dot', style: { background: e.dot } }) : el('i', {}, e.i || ''), e.t, e.k ? el('kbd', {}, e.k) : null)); }
  document.body.append(m);
  const r = pos || anker.getBoundingClientRect(); const w = m.offsetWidth, h = m.offsetHeight;
  let x = pos ? pos.x : r.left, y = pos ? pos.y : r.top - h - 6; if (y < 6) y = (pos ? pos.y : r.bottom + 6); if (y + h > innerHeight) y = innerHeight - h - 6; if (x + w > innerWidth) x = innerWidth - w - 6;
  Object.assign(m.style, { left: x + 'px', top: y + 'px' });
  setTimeout(() => addEventListener('pointerdown', function weg(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', weg, true); } }, true), 0);
  return m;
}
function ordnerMenue(anker, pos) {
  const ids = auswahlIds(); const e = state.ordner.map(o => ({ t: o.name, dot: o.farbe, k: o.taste ? String(o.taste) : '', f: () => sortiere(ids, o.id) }));
  e.push('-', { i: '＋', t: tr('Neuer Ordner …'), f: async () => { const o = await window.BS.ordnerNeu(); if (o) sortiere(ids, o.id); } }, { i: '⊘', t: tr('Aus Ordner nehmen (unsortiert)'), k: '0', f: () => sortiere(ids, null) });
  menue(anker, e, pos);
}
function bewertungsMenue(anker, pos) {
  const ids = auswahlIds();
  menue(anker, [...[5, 4, 3, 2, 1].map(n => ({ i: '', t: '★'.repeat(n), k: 'Umschalt+' + n, f: () => bewerte(ids, n) })), { i: '☆', t: tr('Keine Sterne'), k: 'Umschalt+0', f: () => bewerte(ids, 0) }, '-',
  { i: '⚑', t: tr('Markieren (Favorit)'), k: 'P', f: () => flagge(ids, 1) }, { i: '✕', t: tr('Ablehnen'), k: 'X', f: () => flagge(ids, -1) }, { i: '○', t: tr('Markierung weg'), k: 'U', f: () => flagge(ids, 0) }, '-',
  ...FARBEN.map(([k, c]) => ({ dot: c, t: tr('Farbe {0}', FARBNAME[k]), f: () => farbe(ids, k) })), { i: '○', t: tr('Keine Farbe'), f: () => farbe(ids, '') }], pos);
}
function kontext(e) {
  const k = e.target.closest('.kachel'); if (!k) return; e.preventDefault();
  if (!state.auswahl.has(k.dataset.id)) { state.auswahl.clear(); state.auswahl.add(k.dataset.id); state.fokus = k.dataset.id; auswahlAnzeigen(); }
  const ids = auswahlIds(), pos = { x: e.clientX, y: e.clientY };
  menue(null, [
    { i: '✎', t: tr('Bearbeiten'), k: 'Enter', f: () => location.hash = '#/bearbeiten/' + ids[0] },
    { i: '📁', t: tr('In Ordner …'), f: () => ordnerMenue(null, pos) },
    { i: '★', t: tr('Bewerten / Markieren …'), f: () => bewertungsMenue(null, pos) },
    '-',
    { i: '⧉', t: tr('Bearbeitung kopieren'), k: tr('Strg+Umsch+C'), f: () => window.BS.kopieren(ids[0]) },
    { i: '⎘', t: tr('Bearbeitung einfügen'), k: tr('Strg+Umsch+V'), f: () => window.BS.einfuegen(ids) },
    { i: '✨', t: tr('Automatisch verbessern …'), f: () => window.BS.autoVerbessern(ids) },
    { i: '↺', t: tr('Bearbeitung zurücksetzen'), f: () => window.BS.zuruecksetzen(ids) },
    '-',
    { i: '⇪', t: tr('Exportieren …'), k: tr('Strg+E'), f: () => window.BS.export(ids) },
    FREI ? { i: '📤', t: tr('Teilen (WhatsApp, Mail-Programm …) …'), f: () => window.BS.versand(ids) } : { i: '✉', t: tr('Versenden (Mail, WhatsApp, Baustellen-App) …'), f: () => window.BS.versand(ids) },
    { i: '🖨', t: tr('Drucken …'), k: tr('Strg+P'), f: () => window.BS.drucken(ids) },
    { i: '📄', t: FREI ? tr('Vorschlagsblatt (PDF + Word)') : tr('Vorschlagsblatt für Bauherrn (PDF)'), f: () => window.BS.vorschlag(ids[0]) },
    '-',
    { i: 'ℹ', t: tr('Bild-Informationen'), f: () => infoDialog(ids[0]) },
    { i: '🗑', t: tr('Aus Bildstudio entfernen'), k: tr('Entf'), f: () => wegnehmen(ids) }
  ], pos);
}
async function infoDialog(id) {
  const r = state.recs.get(id); const x = r.exif || {}; const z = (a, b) => b ? `<tr><td style="color:var(--tx2);padding:2px 12px 2px 0">${a}</td><td>${esc(b)}</td></tr>` : '';
  const { modal } = await import('./util.js');
  modal({ titel: tr('Bild-Informationen'), inhalt: `<table>${z(tr('Datei'), r.name)}${z(tr('Größe'), `${r.w} × ${r.h} px · ${fmtBytes(r.bytes || 0)}`)}${z(tr('Aufnahme'), fmtDate(r.aufnahme))}${z(tr('Kamera'), [x.kamera_hersteller, x.kamera].filter(Boolean).join(' '))}${z(tr('Objektiv'), x.objektiv)}${z(tr('Belichtung'), [x.belichtung, x.blende, x.iso ? 'ISO ' + x.iso : '', x.brennweite].filter(Boolean).join(' · '))}${z(tr('Herkunft'), { pc: 'PC', gfotos: 'Google Fotos', drive: 'Google Drive', baustelle: tr('Baustelle (Drive)'), kamera: tr('Kamera'), url: tr('Internet'), ablage: tr('Zwischenablage'), importordner: tr('Import-Ordner') }[r.quelle] || r.quelle)}${z(tr('Baustelle'), r.quelleInfo?.baustelle)}${z(tr('Ordner'), ordner(r.ordner)?.name)}${z('GPS', x.hatGPS ? tr('Standort im Original enthalten – wird beim Export entfernt') : '')}${z('RAW', r.raw ? tr('RAW-Datei – bearbeitet wird die eingebettete Kamera-Vorschau') : '')}</table>`, knoepfe: [{ text: tr('Schließen'), wert: null }] });
}

/* ───────── Aktionen ───────── */
export async function sortiere(ids, ordnerId, weiter = false) {
  if (!ids.length) return; await einsortieren(ids, ordnerId); const o = ordner(ordnerId);
  toast(o ? `${ids.length} → ${o.name}` : tr('{0} → unsortiert', ids.length), 'ok', 1400);
  if (weiter) naechstes(1);
  if (state.ansicht === 'unsortiert' || state.ansicht.startsWith('ordner:')) neuZeichnen(); else ids.forEach(kachelAktualisieren);
}
export async function bewerte(ids, n) { await setzen(ids, 'sterne', n); ids.forEach(kachelAktualisieren); toast(n ? '★'.repeat(n) : tr('Sterne entfernt'), 'ok', 1000); }
export async function flagge(ids, f) { await setzen(ids, 'flag', f); if (f === -1 && state.ansicht !== 'abgelehnt') neuZeichnen(); else ids.forEach(kachelAktualisieren); }
export async function farbe(ids, k) { await setzen(ids, 'farbe', k); ids.forEach(kachelAktualisieren); }
function naechstes(d) {
  if (!liste.length) return; let i = liste.findIndex(r => r.id === state.fokus); i = Math.max(0, Math.min(liste.length - 1, i + d));
  state.fokus = liste[i].id; state.auswahl.clear(); state.auswahl.add(state.fokus); auswahlAnzeigen();
  $(`.kachel[data-id="${state.fokus}"]`)?.scrollIntoView({ block: 'nearest' });
}
/** Tasten in der Bibliothek */
export function taste(e) {
  if (!wurzel || !document.body.contains(wurzel) || e.target.closest('input,textarea,select')) return false;
  const ids = auswahlIds(), sp = Math.max(1, Math.floor(($('#raster').clientWidth - 24) / ((state.einst.kachel || 190) + 10)));
  const c = e.code;
  if (e.key === 'ArrowRight') { naechstes(1); return true; } if (e.key === 'ArrowLeft') { naechstes(-1); return true; }
  if (e.key === 'ArrowDown') { naechstes(sp); return true; } if (e.key === 'ArrowUp') { naechstes(-sp); return true; }
  if (e.key === 'Enter' && ids.length) { location.hash = '#/bearbeiten/' + ids[0]; return true; }
  if (e.key === ' ') { sichten(); return true; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { state.auswahl = new Set(liste.map(r => r.id)); auswahlAnzeigen(); return true; }
  if (e.key === 'Delete') { wegnehmen(ids); return true; }
  if (/^Digit[0-9]$/.test(c) || /^Numpad[0-9]$/.test(c)) {
    const n = +c.slice(-1); if (!ids.length) return true;
    if (e.shiftKey) { if (n <= 5) bewerte(ids, n); return true; }
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (n === 0) { sortiere(ids, null, ids.length === 1); return true; }
    const o = ordnerPerTaste(n); if (o) sortiere(ids, o.id, ids.length === 1); else toast(tr('Taste {0} ist noch keinem Ordner zugeordnet – lege links einen Ordner an.', n), 'warn');
    return true;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === 'p') { flagge(ids, 1); return true; } if (k === 'x') { flagge(ids, -1); return true; } if (k === 'u') { flagge(ids, 0); return true; }
  if (k === 'e') { if (ids.length) location.hash = '#/bearbeiten/' + ids[0]; return true; }
  return false;
}

/* ───────── Ziehen in den Explorer / auf Ordner ───────── */
const ziehCache = new Map();
async function vorbereitenZiehen(id) {
  const r = state.recs.get(id); if (!r) return; const key = id + ':' + (r.bearbeitet || 0); if (ziehCache.has(key)) return;
  try {
    let blob;
    if (istBearbeitet(r.edit)) { const b = await bitmap(r); const c = rendern(b, r.id, r.edit); blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.93)); }
    else blob = await original(id);
    for (const k of ziehCache.keys()) if (k.startsWith(id + ':')) { URL.revokeObjectURL(ziehCache.get(k).url); ziehCache.delete(k); }
    ziehCache.set(key, { url: URL.createObjectURL(blob), typ: blob.type || 'image/jpeg' });
  } catch (e) { console.warn(e); }
}
function ziehStart(e) {
  const k = e.target.closest('.kachel'); if (!k) return; const id = k.dataset.id;
  if (!state.auswahl.has(id)) { state.auswahl.clear(); state.auswahl.add(id); state.fokus = id; auswahlAnzeigen(); }
  const ids = auswahlIds(); e.dataTransfer.setData('text/x-bs-ids', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'copyMove';
  const r = state.recs.get(id); const c = ziehCache.get(id + ':' + (r.bearbeitet || 0));
  if (c && ids.length === 1) { const nm = r.name.replace(/\.[^.]+$/, '') + (istBearbeitet(r.edit) ? '_bearbeitet' : '') + (c.typ === 'image/png' ? '.png' : c.typ === 'image/webp' ? '.webp' : '.jpg'); e.dataTransfer.setData('DownloadURL', `${c.typ}:${nm}:${c.url}`); }
  const img = k.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 40, 40);
  document.body.classList.add('zieht');
  addEventListener('dragend', () => document.body.classList.remove('zieht'), { once: true });
}

/* ───────── Sichten: Vollbild, Bild für Bild sortieren ───────── */
export async function sichten(startId) {
  if (!liste.length) { toast(tr('Keine Bilder in dieser Ansicht.'), 'warn'); return; }
  let i = Math.max(0, liste.findIndex(r => r.id === (startId || state.fokus))); let blitzT = null;
  const box = el('div', { id: 'sichten', 'data-hilfe': 'sichten' }); document.body.append(box); document.body.classList.add('sichten-offen');
  const zeichne = async () => {
    const r = liste[i]; if (!r) { schliessen(); return; } state.fokus = r.id; const o = ordner(r.ordner);
    box.innerHTML = '';
    const bildBox = el('div', { class: 's-bild' }, el('div', { class: 'ed-laden' }, tr('lädt …')));
    box.append(
      el('div', { class: 's-oben' }, el('b', {}, `${i + 1} / ${liste.length}`), el('span', {}, r.name), el('span', {}, fmtDate(r.aufnahme)),
        el('span', { style: 'color:var(--gelb)' }, '★'.repeat(r.sterne || 0)), r.flag === 1 ? el('span', {}, tr('⚑ markiert')) : null, o ? el('span', { style: { color: o.farbe } }, '📁 ' + o.name) : el('span', {}, 'unsortiert'),
        el('span', { class: 'platz' }), el('span', { class: 'hinweis' }, tr('← → blättern · Ziffer = in Ordner · Umschalt+Ziffer = Sterne · P/X markieren/ablehnen · E bearbeiten · Esc zurück')),
        el('button', { class: 'btn', onclick: schliessen }, tr('✕ Schließen'))),
      bildBox,
      el('div', { class: 's-unten' }, ...state.ordner.map(oo => el('button', { class: 's-ord' + (r.ordner === oo.id ? ' an' : ''), onclick: () => einord(oo.id) }, oo.taste ? el('kbd', {}, oo.taste) : null, el('span', { class: 'dot', style: { background: oo.farbe } }), oo.name)),
        el('button', { class: 's-ord', onclick: async () => { const oo = await window.BS.ordnerNeu(); if (oo) einord(oo.id); } }, tr('＋ Neuer Ordner')),
        el('button', { class: 's-ord', onclick: () => einord(null) }, el('kbd', {}, '0'), 'unsortiert')));
    bildBox.append(el('button', { class: 's-nav', style: 'left:12px', onclick: () => geh(-1) }, '‹'), el('button', { class: 's-nav', style: 'right:12px', onclick: () => geh(1) }, '›'));
    try {
      const b = await bitmap(r); if (liste[i] !== r) return;
      const c = rendern(b, r.id, r.edit, { maxW: innerWidth * devicePixelRatio, maxH: (innerHeight - 140) * devicePixelRatio });
      c.style.width = Math.min(c.width / devicePixelRatio, innerWidth * 0.96) + 'px'; c.style.height = 'auto'; c.style.maxHeight = '100%';
      bildBox.querySelector('.ed-laden').remove(); bildBox.prepend(c);
    } catch (e) { bildBox.querySelector('.ed-laden').textContent = tr('Bild konnte nicht geladen werden'); }
  };
  const blitz = (t) => { box.querySelector('.blitz')?.remove(); const b = el('div', { class: 'blitz' }, t); box.querySelector('.s-bild')?.append(b); clearTimeout(blitzT); blitzT = setTimeout(() => b.remove(), 900); };
  const geh = (d) => { i = Math.max(0, Math.min(liste.length - 1, i + d)); zeichne(); };
  const einord = async (oid) => {
    const r = liste[i]; await einsortieren([r.id], oid); const o = ordner(oid); blitz(o ? '📁 ' + o.name : 'unsortiert');
    if (state.ansicht === 'unsortiert' && oid) { liste.splice(i, 1); if (i >= liste.length) i = liste.length - 1; setTimeout(zeichne, 350); }
    else setTimeout(() => geh(1), 350);
  };
  const key = async (e) => {
    if (e.target.closest('input,textarea')) return; const r = liste[i]; let ok = true;
    if (e.key === 'Escape') schliessen(); else if (e.key === 'ArrowRight' || e.key === ' ') geh(1); else if (e.key === 'ArrowLeft') geh(-1);
    else if (/^(Digit|Numpad)[0-9]$/.test(e.code)) { const n = +e.code.slice(-1); if (e.shiftKey) { if (n <= 5) { await setzen([r.id], 'sterne', n); blitz(n ? '★'.repeat(n) : tr('keine Sterne')); zeichne(); } } else if (n === 0) einord(null); else { const o = ordnerPerTaste(n); if (o) einord(o.id); else blitz(tr('Taste {0} frei – Ordner anlegen', n)); } }
    else if (e.key.toLowerCase() === 'p') { await setzen([r.id], 'flag', 1); blitz(tr('⚑ markiert')); zeichne(); } else if (e.key.toLowerCase() === 'x') { await setzen([r.id], 'flag', -1); blitz(tr('✕ abgelehnt')); geh(1); }
    else if (e.key.toLowerCase() === 'u') { await setzen([r.id], 'flag', 0); zeichne(); } else if (e.key.toLowerCase() === 'e') { schliessen(); location.hash = '#/bearbeiten/' + r.id; }
    else ok = false;
    if (ok) { e.preventDefault(); e.stopPropagation(); }
  };
  function schliessen() { removeEventListener('keydown', key, true); box.remove(); document.body.classList.remove('sichten-offen'); neuZeichnen(); }
  addEventListener('keydown', key, true); zeichne();
}

on('rec', (r) => kachelAktualisieren(r.id));
on('recs', rafThrottle(() => { if (wurzel && document.body.contains(wurzel) && $('#raster')) neuZeichnen(); }));
export function neu() { if (wurzel && document.body.contains(wurzel)) zeigen(wurzel); }
void emit;
