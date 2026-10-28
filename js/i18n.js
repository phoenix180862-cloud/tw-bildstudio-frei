// TW Bildstudio – Sprachen (Deutsch = Quelle; Englisch, Tschechisch, Slowakisch, Ukrainisch, Polnisch)
// Schlüssel ist immer der deutsche Text: tr('Bilder holen') → „Get pictures“. Platzhalter {0}, {1} … werden der Reihe nach ersetzt.
// Wörterbücher: i18n/<sprache>.json (aus i18n/quelle/*.json gebaut mit tools/i18n.py bauen). Sprachwechsel = Seite neu laden.
export const SPRACHEN = [['de', 'Deutsch'], ['en', 'English'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['uk', 'Українська'], ['pl', 'Polski']];
const LS = 'tw_bs_sprache';
const CODES = SPRACHEN.map(s => s[0]);

function erkennen() {
  try { const g = localStorage.getItem(LS); if (CODES.includes(g)) return g; } catch (e) { }
  // Thomas' Fassung bleibt ohne eigene Wahl immer Deutsch; die kostenlose Fassung richtet sich nach dem Browser
  if (typeof window === 'undefined' || window.TW_FREI !== true) return 'de';
  for (const l of (navigator.languages?.length ? navigator.languages : [navigator.language || 'de'])) {
    const k = String(l).toLowerCase().split('-')[0];
    if (CODES.includes(k)) return k;
  }
  return 'de';
}
export const SPRACHE = erkennen();
let WB = {};
if (SPRACHE !== 'de') {
  try { WB = await (await fetch(new URL(`../i18n/${SPRACHE}.json?v=20261028-3`, import.meta.url))).json(); }
  catch (e) { console.warn('Sprachdatei fehlt:', SPRACHE, e); WB = {}; }
}
try { document.documentElement.lang = SPRACHE; } catch (e) { }

/** übersetzen: tr('Text mit {0} und {1}', a, b) */
export function tr(text, ...werte) {
  let s = (SPRACHE !== 'de' && WB[text]) || text;
  if (werte.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (werte[+i] ?? ''));
  return s;
}
/** Text mit Mengen: trz(n, '{0} Bild', '{0} Bilder') – Sprachen mit mehreren Mehrzahlformen (cs, sk, uk, pl) bekommen die
 *  passende Form über Schlüssel „{0} Bilder|2“ (2–4) bzw. „{0} Bilder|5“ (ab 5), falls vorhanden */
export function trz(n, eins, viele) {
  if (n === 1) return tr(eins, n);
  if (SPRACHE !== 'de' && SPRACHE !== 'en') {
    const r10 = n % 10, r100 = n % 100; const wenige = r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14);
    const k = viele + (wenige ? '|2' : '|5'); if (WB[k]) return tr(k, n);
  }
  return tr(viele, n);
}
export function spracheSetzen(code) { try { localStorage.setItem(LS, code); } catch (e) { } location.reload(); }
/** statisches HTML übersetzen: data-t (Text), data-t-title, data-t-placeholder – der deutsche Text steht im HTML */
export function htmlUebersetzen(wurzel = document) {
  if (SPRACHE === 'de') return;
  for (const e of wurzel.querySelectorAll('[data-t]')) e.textContent = tr(e.textContent.trim());
  for (const e of wurzel.querySelectorAll('[data-t-title]')) e.title = tr(e.title);
  for (const e of wurzel.querySelectorAll('[data-t-placeholder]')) e.placeholder = tr(e.placeholder);
}
/** Datum/Zahl im Format der Sprache */
export const LOCALE = { de: 'de-DE', en: 'en-GB', cs: 'cs-CZ', sk: 'sk-SK', uk: 'uk-UA', pl: 'pl-PL' }[SPRACHE];
/** Zahl mit Dezimalzeichen der Sprache: zahl(1.5) → „1,5“ (de) bzw. „1.5“ (en) */
export const zahl = (x, stellen = 1) => Number(x).toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: stellen });
