// TW Bildstudio – Startseite (Dashboard): Logo, Schnellstart, Kennzahlen, zuletzt bearbeitet, Ordner, Quellen
import { state, zaehler, thumbUrl, ordner } from './store.js';
import { QUELLEN } from './sources.js';
import { istBearbeitet } from './engine.js';
import * as db from './db.js';
import { $, el, fmtBytes, fmtDate } from './util.js';
import { farbWert } from './library.js';
import { FREI, herstellerHinweis } from './frei.js';
import { tr, trz } from './i18n.js';

export function logo(untertitel = 'Bildstudio', gross = false) {
  return el('div', { class: 'logo-container' + (gross ? ' gross' : '') },
    el('div', { class: 'logo-thomas-row' }, el('span', { class: 'logo-thomas-text' }, 'Thomas')),
    el('div', { class: 'logo-word-row' }, el('span', { class: 'logo-w' }, 'w'), el('span', { class: 'logo-i-wrap' }, el('span', { class: 'logo-i-char' }, 'ı'), el('span', { class: 'logo-i-dot' })), el('span', { class: 'logo-LL' }, 'LL'), el('span', { class: 'logo-wacher' }, 'wacher')),
    el('div', { class: 'logo-subtitle-row' }, el('span', { class: 'logo-subtitle-text' }, untertitel)));
}
const geh = (ansicht) => { state.ansicht = ansicht; state.auswahl.clear(); location.hash = '#/bibliothek'; };
const ICON = {
  bild: '<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  ordner: '<path d="M3 6h6l2 2h10v11H3z"/>', stern: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  stift: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>', kreis: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', speicher: '<path d="M5 4h14v16H5z"/><path d="M8 4v5h8V4"/>',
  pfeil: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
const svg = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.innerHTML = ICON[n] || ''; return s; };

export function zeigen(root) {
  root.innerHTML = ''; const z = zaehler(); const recs = [...state.recs.values()];
  const wrap = el('div', { class: 'start' });
  // Hero
  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero-logo' }, logo('Bildstudio', true)),
    ...(FREI ? [
      el('h1', {}, tr('Alle Fotos. Sortiert. Bearbeitet. Geteilt.')),
      el('p', {}, tr('Fotos vom PC, Handy oder aus der Kamera holen, in Sekunden einsortieren, wie im Fotostudio bearbeiten, Pfeile und Maße einzeichnen – und direkt drucken (bis DIN A0), exportieren oder teilen.')),
      el('div', { class: 'frei-punkte' }, el('span', {}, tr('✓ kostenlos')), el('span', {}, tr('✓ ohne Anmeldung')), el('span', {}, tr('✓ deine Bilder bleiben auf deinem Gerät')))
    ] : [
      el('h1', {}, tr('Alle Fotos. Sortiert. Bearbeitet. Verschickt.')),
      el('p', {}, tr('Baustellenfotos und Referenzbilder aus PC, Google Fotos und Drive holen, in Sekunden einsortieren, wie im Fotostudio bearbeiten, für den Bauherrn einzeichnen – und direkt drucken, exportieren oder an die Baustellen-App schicken.'))]),
    el('div', { class: 'aktionen' },
      el('button', { class: 'btn orange gross', onclick: (e) => window.BS.importMenue(e.currentTarget) }, tr('＋ Bilder holen')),
      el('button', { class: 'btn gross', onclick: () => geh('alle') }, tr('▦ Zur Bibliothek')),
      z.unsortiert ? el('button', { class: 'btn gross ghost', onclick: () => { geh('unsortiert'); setTimeout(() => window.BS.lib.sichten(), 400); } }, tr('⛶ {0} unsortierte sichten', z.unsortiert)) : null),
    el('div', { class: 'linie' }));
  // Kennzahlen
  const kpi = (n, t, ico, farbe, ziel) => el('button', { class: 'kpi', style: farbe ? `--kf:${farbe}` : '', onclick: ziel }, el('span', { class: 'kpi-ico' }, svg(ico)), el('b', {}, String(n)), el('small', {}, t));
  const bearbeitetN = recs.filter(r => istBearbeitet(r.edit)).length;
  const kpis = el('section', { class: 'kpis' },
    kpi(z.alle, tr('Bilder'), 'bild', '', () => geh('alle')),
    kpi(z.unsortiert, tr('Unsortiert'), 'kreis', z.unsortiert ? '#f39c12' : '', () => geh('unsortiert')),
    kpi(bearbeitetN, tr('Bearbeitet'), 'stift', '#4cd486', () => geh('bearbeitet')),
    kpi(z.favoriten, tr('Favoriten'), 'stern', '#facc15', () => geh('favoriten')),
    kpi(state.ordner.length, tr('Ordner'), 'ordner', '#4da6ff', () => geh('alle')),
    kpi('…', tr('Speicher belegt'), 'speicher', '', () => window.BS.einstellungen?.()));
  db.speicherInfo().then(i => { if (i) kpis.lastChild.querySelector('b').textContent = fmtBytes(i.usage || 0); });
  wrap.append(hero, kpis);

  // Zuletzt bearbeitet / zuletzt hinzugefügt
  const zuletzt = recs.filter(r => r.bearbeitet).sort((a, b) => b.bearbeitet - a.bearbeitet).slice(0, 8);
  const neu = recs.sort((a, b) => b.importiert - a.importiert).slice(0, 8);
  const streifen = (titel, liste, leer, mehr) => el('section', { class: 'panel' },
    el('div', { class: 'kopf' }, el('h3', {}, titel), mehr ? el('button', { class: 'btn klein', onclick: mehr }, tr('alle') + ' ' + ICON_PFEIL) : null),
    liste.length ? el('div', { class: 'streifen' }, ...liste.map(r => { const img = el('img', { alt: '' }); thumbUrl(r).then(u => img.src = u); return el('button', { class: 'st-bild', title: r.name, onclick: () => { location.hash = '#/bearbeiten/' + r.id; } }, img, el('span', {}, r.titel || r.name.replace(/\.[^.]+$/, '')), r.farbe ? el('i', { style: { background: farbWert(r.farbe) } }) : null); })) : el('p', { class: 'hinweis leer' }, leer));
  wrap.append(el('div', { class: 'zwei' },
    streifen(tr('Zuletzt bearbeitet'), zuletzt, tr('Noch nichts bearbeitet – Doppelklick auf ein Bild öffnet die Bearbeitung.'), () => geh('bearbeitet')),
    streifen(tr('Neu hinzugekommen'), neu, tr('Noch keine Bilder – oben „Bilder holen“.'), () => { state.sort = 'import'; geh('alle'); })));

  // Ordner als Karten mit Vorschau
  const ord = el('section', { class: 'panel' }, el('div', { class: 'kopf' }, el('h3', {}, tr('Deine Ordner')), el('button', { class: 'btn klein', onclick: () => window.BS.ordnerNeu().then(() => zeigen(root)) }, tr('＋ Neuer Ordner'))));
  const kacheln = el('div', { class: 'ordner-karten' });
  if (!state.ordner.length) kacheln.append(el('p', { class: 'hinweis leer' }, tr('Lege Ordner an – z. B. „Bad OG“, „Referenz Webseite“, „Mängel“. Jeder bekommt eine Taste 1–9 zum blitzschnellen Einsortieren.')));
  for (const o of state.ordner) {
    const bilder = recs.filter(r => r.ordner === o.id).slice(0, 4); const mosaik = el('div', { class: 'mosaik' });
    for (let i = 0; i < 4; i++) { const r = bilder[i]; const img = el('img', { alt: '' }); if (r) thumbUrl(r).then(u => img.src = u); mosaik.append(r ? img : el('span')); }
    kacheln.append(el('button', { class: 'ordner-karte', style: { '--of': o.farbe }, onclick: () => geh('ordner:' + o.id) }, mosaik,
      el('div', { class: 'ok-text' }, el('b', {}, o.name), el('small', {}, tr('{0} Bilder', z.ordner[o.id] || 0)), o.taste ? el('kbd', { title: tr('Taste ') + o.taste }, o.taste) : null)));
  }
  ord.append(kacheln); wrap.append(ord);

  // Quellen
  const q = el('section', { class: 'panel' }, el('div', { class: 'kopf' }, el('h3', {}, tr('Bilder holen aus …'))),
    el('div', { class: 'quellen' }, ...QUELLEN.filter(x => x.k !== 'url').map(x => el('button', { class: 'quelle', onclick: () => window.BS.import(x.k) }, el('span', { class: 'q-ico' }, x.i), el('b', {}, x.t), el('small', {}, x.h)))));
  wrap.append(q);
  wrap.append(el('p', { class: 'fusszeile' }, FREI ? tr('Deine Bilder liegen nur in diesem Browser auf diesem Gerät · Originale werden nie verändert') : tr('Deine Bilder liegen sicher in diesem Browser auf diesem PC · Originale werden nie verändert · Stand {0}', fmtDate(Date.now()))));
  if (FREI) wrap.append(herstellerHinweis());
  root.append(el('div', { class: 'start-scroll' }, wrap));
}
const ICON_PFEIL = '›';
void $; void ordner;
