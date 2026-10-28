// TW Bildstudio – kleine Helfer (DOM, Meldungen, Dialoge)
import { tr, trz, LOCALE } from './i18n.js';
const DEZ = (1.5).toLocaleString(LOCALE).charAt(1); // Dezimalzeichen der Sprache
// append/prepend überspringen leere Einträge (null/false) – erlaubt bedingte Elemente direkt in der Liste
for (const f of ['append', 'prepend']) { const o = Element.prototype[f]; Element.prototype[f] = function (...a) { return o.apply(this, a.filter(x => x != null && x !== false)); }; }
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function rafThrottle(fn) { let p = false, args; return (...a) => { args = a; if (p) return; p = true; requestAnimationFrame(() => { p = false; fn(...args); }); }; }
export const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1).replace('.', DEZ) + ' MB';
export const fmtDate = (t) => t ? new Date(t).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
export const fmtDateTime = (t) => t ? new Date(t).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const isoDate = (t) => { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

/* ───────── Meldungen ───────── */
export function toast(text, art = 'ok', ms = 3200) {
  let box = $('#toasts'); if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const t = el('div', { class: 'toast ' + art }, text); box.append(t);
  setTimeout(() => { t.classList.add('weg'); setTimeout(() => t.remove(), 400); }, ms);
  return t;
}

/* ───────── Fortschritt ───────── */
export function fortschritt(titel) {
  const ov = el('div', { class: 'mdl-wrap fs' }, el('div', { class: 'mdl klein' },
    el('div', { class: 'mdl-kopf' }, el('h3', {}, titel)),
    el('div', { class: 'mdl-inhalt' }, el('div', { class: 'pbar' }, el('i')), el('div', { class: 'ptext' }, tr('wird vorbereitet …')))));
  document.body.append(ov); let abbruch = false;
  const b = el('button', { class: 'btn', onclick: () => { abbruch = true; b.textContent = tr('wird abgebrochen …'); } }, tr('Abbrechen'));
  ov.querySelector('.mdl-inhalt').append(el('div', { class: 'mdl-fuss' }, b));
  return {
    set(i, n, text) { ov.querySelector('.pbar i').style.width = (n ? Math.round(i / n * 100) : 0) + '%'; if (text != null) ov.querySelector('.ptext').textContent = text; },
    get abgebrochen() { return abbruch; },
    zu() { ov.remove(); }
  };
}

/* ───────── Dialoge ───────── */
export function modal({ titel, inhalt, knoepfe = [], breit = false, hilfe = null, klasse = '' }) {
  return new Promise(res => {
    const wrap = el('div', { class: 'mdl-wrap' });
    const kopf = el('div', { class: 'mdl-kopf' }, el('h3', {}, titel), el('span', { style: 'flex:1' }),
      hilfe ? el('button', { class: 'ib hilfe-mini', title: tr('Video dazu ansehen'), 'data-hilfe': hilfe, onclick: () => window.BS?.hilfe?.(hilfe) }, 'i') : null,
      el('button', { class: 'ib', title: tr('Schließen (Esc)'), onclick: () => zu(null) }, '✕'));
    const body = el('div', { class: 'mdl-inhalt' }); if (typeof inhalt === 'string') body.innerHTML = inhalt; else if (inhalt) body.append(inhalt);
    const fuss = el('div', { class: 'mdl-fuss' });
    for (const k of knoepfe) fuss.append(el('button', { class: 'btn ' + (k.art || ''), onclick: async () => { if (k.vorher) { const ok = await k.vorher(body); if (ok === false) return; } zu(typeof k.wert === 'function' ? k.wert(body) : k.wert); } }, k.text));
    const box = el('div', { class: 'mdl ' + (breit ? 'breit ' : '') + klasse }, kopf, body, knoepfe.length ? fuss : null);
    if (hilfe) box.dataset.hilfe = hilfe;
    wrap.append(box); document.body.append(wrap); document.body.classList.add('mdl-offen');
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) zu(null); });
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); zu(null); } };
    addEventListener('keydown', key, true);
    const erst = body.querySelector('input:not([type=checkbox]):not([type=range]),select,textarea'); if (erst) setTimeout(() => erst.focus(), 50);
    function zu(v) { removeEventListener('keydown', key, true); wrap.remove(); if (!document.querySelector('.mdl-wrap')) document.body.classList.remove('mdl-offen'); res(v); }
    wrap._zu = zu;
  });
}
export const bestaetigen = (text, titel = tr('Bitte bestätigen'), ja = tr('Ja')) => modal({ titel, inhalt: el('p', {}, text), knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: ja, art: 'primaer', wert: true }] });
export async function eingabe(titel, vorgabe = '', label = '') {
  const inp = el('input', { type: 'text', value: vorgabe, class: 'inp', style: 'width:100%' });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.closest('.mdl').querySelector('.btn.primaer').click(); } });
  const r = await modal({ titel, inhalt: el('div', {}, label ? el('label', { class: 'lbl' }, label) : null, inp), knoepfe: [{ text: tr('Abbrechen'), wert: null }, { text: 'OK', art: 'primaer', wert: () => inp.value.trim() }] });
  return r;
}

/* Kleines Info-Fensterchen (ⓘ) neben Reglern */
export function infoPunkt(text, video) {
  const b = el('span', { class: 'ip', tabindex: 0, 'aria-label': tr('Info') }, 'i');
  b.addEventListener('mouseenter', () => zeigeTipp(b, text, video));
  b.addEventListener('focus', () => zeigeTipp(b, text, video));
  b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); zeigeTipp(b, text, video, true); });
  return b;
}
let tippEl = null, tippT = null;
function zeigeTipp(anker, text, video, fest) {
  clearTimeout(tippT); if (tippEl) tippEl.remove();
  tippEl = el('div', { class: 'tipp' + (fest ? ' fest' : '') }, el('div', {}, text), video ? el('button', { class: 'tipp-vid', onclick: () => { window.BS?.hilfe?.(video); tippEl?.remove(); } }, tr('▶ Video dazu')) : null);
  document.body.append(tippEl);
  const r = anker.getBoundingClientRect(), w = tippEl.offsetWidth, h = tippEl.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8; if (y < 6) y = r.bottom + 8;
  x = clamp(x, 6, innerWidth - w - 6);
  Object.assign(tippEl.style, { left: x + 'px', top: y + 'px' });
  const weg = () => { tippT = setTimeout(() => { if (tippEl && !tippEl.matches(':hover')) { tippEl.remove(); tippEl = null; } }, fest ? 6000 : 250); };
  anker.addEventListener('mouseleave', weg, { once: true }); anker.addEventListener('blur', weg, { once: true });
  tippEl.addEventListener('mouseleave', weg);
}

export function dateiSpeichern(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
/** Dateiname bereinigen (optional web-tauglich: klein, ohne Umlaute/Leerzeichen) */
export function dateiname(s, web = false) {
  let n = String(s || 'bild').replace(/[\\/:*?"<>|]+/g, '-').trim();
  if (web) n = n.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return n || 'bild';
}
