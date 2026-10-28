// TW Bildstudio – Info & Hilfe (wie Master-App, Hausverwaltung, TW-CAD)
//  • gelber Info-Knopf unten links in der Seitenleiste (im Editor kompakt) → Menü mit den Videos zu dieser Stelle, die passende zuerst
//  • Hilfe-Fenster: am PC eigenes kleines Fenster (auf den zweiten Bildschirm ziehen), am Tablet/Handy schwebend
//  • das Fenster folgt der Arbeit: Seite → Werkzeug → offenes Fenster (data-hilfe)
import { HILFE, HILFE_FUER, HILFE_SEITE, MIT_HANDBUCH } from './hilfe-frei.js?v=20261027-1';
import { tr, trz } from './i18n.js';

let kanal = null, fenster = null, floatEl = null, letzter = 'start', seite = 'bibliothek';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const thema = (id) => HILFE.find(t => t.id === id);
const dauer = (s) => s ? (s >= 60 ? Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') + tr(' Min.') : Math.round(s) + ' s') : '';

export function schluessel() {
  const k = [];
  const m = [...document.querySelectorAll('.mdl-wrap [data-hilfe], .mdl-wrap .mdl[data-hilfe]')].pop(); if (m && m.dataset.hilfe) k.push('#' + m.dataset.hilfe);
  if (document.getElementById('sichten')) k.push('#sichten');
  const wz = document.querySelector('#edWz .wz.an'); if (seite === 'bearbeiten' && wz) k.push('bearbeiten/' + wz.dataset.wz);
  if (seite === 'start') k.push('bibliothek');
  k.push(seite); return k;
}
export function aktuellesThema() {
  for (const s of schluessel()) { if (s.startsWith('#') && thema(s.slice(1))) return s.slice(1); if (HILFE_FUER[s]) return HILFE_FUER[s]; }
  return 'start';
}
export function init() {
  try { kanal = new BroadcastChannel('tw-bs-hilfe'); kanal.onmessage = (e) => { if (e.data && e.data.frage === 'kontext') senden({ kontext: letzter }); }; } catch (e) { }
  infoKnopf();
  setInterval(() => { const id = aktuellesThema(); if (id !== letzter) { letzter = id; senden({ kontext: id }); } }, 900);
}
function senden(m) { try { kanal && kanal.postMessage(m); } catch (e) { } try { floatEl && floatEl.querySelector('iframe').contentWindow.postMessage(m, location.origin); } catch (e) { } }
export function kontext(s) { seite = s; menuZu(); }
const zuId = (k) => thema(k) ? k : (HILFE_FUER['#' + k] || HILFE_FUER[k] || aktuellesThema());
export function oeffnen(key) {
  const id = zuId(key || aktuellesThema()); letzter = id; menuZu();
  const url = `hilfe.html?thema=${encodeURIComponent(id)}`;
  const touch = matchMedia('(pointer: coarse)').matches && innerWidth < 1100;
  if (!touch) {
    if (fenster && !fenster.closed) { fenster.focus(); senden({ kontext: id, zeigen: true }); return; }
    fenster = window.open(url, 'tw-bs-hilfe', 'popup=yes,width=640,height=760,left=' + (screen.availWidth - 680) + ',top=60');
    if (fenster) return;
  }
  if (floatEl) floatEl.remove();
  floatEl = document.createElement('div'); floatEl.className = 'helpfloat';
  floatEl.innerHTML = `<div class="hd">▶ ${esc(tr('Info & Videos'))} <span style="flex:1"></span><button class="ib" title="${esc(tr('schließen'))}">✕</button></div><iframe src="${url}&eingebettet=1"></iframe>`;
  document.body.append(floatEl);
  floatEl.querySelector('button').onclick = () => { floatEl.remove(); floatEl = null; };
  const hd = floatEl.querySelector('.hd'); let d = null;
  hd.onpointerdown = (e) => { if (e.target.closest('button')) return; d = { x: e.clientX, y: e.clientY, r: floatEl.getBoundingClientRect() }; hd.setPointerCapture(e.pointerId); };
  hd.onpointermove = (e) => { if (!d) return; Object.assign(floatEl.style, { left: (d.r.left + e.clientX - d.x) + 'px', top: (d.r.top + e.clientY - d.y) + 'px', right: 'auto', bottom: 'auto' }); };
  hd.onpointerup = () => d = null;
}
let menuEl = null;
function infoKnopf() {
  const b = document.createElement('button'); b.id = 'infoKnopf'; b.type = 'button'; b.title = tr('Info: So geht’s – Videos zu dieser Stelle (F1)');
  b.innerHTML = `<span class="i">i</span><span class="t">${esc(tr('Info – so geht’s'))}</span>`;
  b.onclick = (e) => { e.stopPropagation(); menuEl ? menuZu() : menuAuf(); };
  document.body.append(b);
  document.addEventListener('click', (e) => { if (menuEl && !e.target.closest('#infoMenu')) menuZu(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuEl) menuZu(); });
}
function menuZu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function menuAuf() {
  const jetzt = aktuellesThema(); const liste = [...new Set([jetzt, ...(HILFE_SEITE[seite] || [])])].filter(thema);
  const bereich = thema(jetzt)?.bereich; const weitere = HILFE.filter(t => t.bereich === bereich && !liste.includes(t.id));
  const zeile = (t, haupt) => `<button class="im-z ${haupt ? 'haupt' : ''}" data-id="${t.id}"><span class="im-play">▶</span><span class="im-t"><b>${esc(t.titel)}</b><small>${esc(trz(t.kapitel?.length || t.schritte.length, '{0} Schritt', '{0} Schritte'))}${t.dauer ? ' · ' + dauer(t.dauer) : t.ohneVideo ? ' · ' + esc(tr('Text')) : ''}</small></span></button>`;
  menuEl = document.createElement('div'); menuEl.id = 'infoMenu';
  menuEl.innerHTML = `<div class="im-kopf"><b>${esc(tr('Info – so geht’s'))}</b><small>${esc(tr('Kurzvideos mit allen Schritten. Das Fenster kannst du auf den zweiten Bildschirm ziehen.'))}</small></div>
    <div class="im-gruppe">${esc(tr('Genau hier'))}</div>${zeile(thema(jetzt), true)}
    ${liste.length > 1 ? `<div class="im-gruppe">${esc(tr('Weitere Videos zu dieser Seite'))}</div>${liste.slice(1, 9).map(id => zeile(thema(id))).join('')}` : ''}
    ${weitere.length ? `<div class="im-gruppe">${esc(tr('Mehr zum Bereich {0}', bereich))}</div>${weitere.slice(0, 8).map(t => zeile(t)).join('')}` : ''}
    <div class="im-fuss"><button data-alle>${esc(MIT_HANDBUCH ? tr('Alle {0} Videos', HILFE.length) : tr('Alle {0} Anleitungen', HILFE.length))}</button>${MIT_HANDBUCH ? `<a href="hilfe/Bildstudio-Handbuch.pdf" target="_blank" rel="noopener">${esc(tr('Handbuch (PDF)'))}</a>` : ''}</div>`;
  document.body.append(menuEl);
  menuEl.addEventListener('click', (e) => { const z = e.target.closest('[data-id]'); if (z) oeffnen(z.dataset.id); if (e.target.closest('[data-alle]')) oeffnen(jetzt); });
}
