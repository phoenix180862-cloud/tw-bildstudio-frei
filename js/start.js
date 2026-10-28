// TW Bildstudio – Startseite: schlanke Begrüßung, neueste Bilder groß, ruhige Übersicht (Fortschritt, Speicher), Ordner, Quellen; leer = Anleitung in 3 Schritten
import { state, zaehler, thumbUrl, ordner } from './store.js';
import { QUELLEN } from './sources.js';
import { istBearbeitet } from './engine.js';
import * as db from './db.js';
import { $, el, fmtBytes, fmtDate } from './util.js';
import { farbWert } from './library.js';
import { FREI, herstellerHinweis } from './frei.js';
import { tr, trz } from './i18n.js';
void trz;

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
  root.innerHTML = ''; const z = zaehler(); const recs = [...state.recs.values()]; const n = recs.length;
  const wrap = el('div', { class: 'start' + (n ? '' : ' leer') });
  // Begrüßung – schlank: Überschrift, ein Satz, Knöpfe (das Firmenlogo sitzt klein in der Kopfleiste)
  wrap.append(el('section', { class: 'gruss' },
    el('div', { class: 'gruss-text' },
      el('h1', {}, FREI ? tr('Deine Fotos – sortiert, bearbeitet, geteilt.') : tr('Deine Fotos – sortiert, bearbeitet, verschickt.')),
      el('p', {}, FREI ? tr('Bilder holen, in Sekunden einsortieren, wie im Fotostudio bearbeiten und einzeichnen – kostenlos, ohne Anmeldung, alles bleibt auf deinem Gerät.')
        : tr('Baustellenfotos holen, einsortieren, bearbeiten und für den Bauherrn einzeichnen – dann drucken, exportieren oder verschicken.'))),
    el('div', { class: 'gruss-knoepfe' },
      el('button', { class: 'btn orange gross', onclick: (e) => window.BS.importMenue(e.currentTarget) }, tr('＋ Bilder holen')),
      n ? el('button', { class: 'btn gross', onclick: () => geh('alle') }, tr('▦ Zur Bibliothek')) : null,
      z.unsortiert ? el('button', { class: 'btn gross ghost', onclick: () => { geh('unsortiert'); setTimeout(() => window.BS.lib.sichten(), 400); } }, tr('⛶ {0} unsortierte sichten', z.unsortiert)) : null)));

  if (!n) {
    // Leere Bibliothek: freundliche Anleitung in drei Schritten statt Nullen
    const schritt = (nr, titel, text, knopf) => el('div', { class: 'schritt' }, el('span', { class: 'schritt-nr' }, String(nr)), el('div', {}, el('b', {}, titel), el('p', {}, text), knopf || null));
    wrap.append(el('section', { class: 'anleitung' },
      el('h2', {}, tr('So startest du in drei Schritten')),
      el('div', { class: 'schritte' },
        schritt(1, tr('Bilder holen'), tr('Vom PC, aus einem ganzen Ordner oder mit der Kamera – oder einfach ins Fenster ziehen.'), el('button', { class: 'btn klein', onclick: (e) => window.BS.importMenue(e.currentTarget) }, tr('＋ Bilder holen'))),
        schritt(2, tr('Einsortieren'), tr('Lege Ordner an und sortiere mit den Tasten 1–9 – blitzschnell, Bild für Bild.')),
        schritt(3, tr('Bearbeiten und weitergeben'), tr('Licht und Farbe verbessern, Pfeile und Maße einzeichnen – dann drucken, exportieren oder teilen.')))));
  } else {
    // Bilder zuerst: die neuesten groß, darunter zuletzt bearbeitet
    const neu = [...recs].sort((a, b) => b.importiert - a.importiert).slice(0, 8);
    const zuletzt = recs.filter(r => r.bearbeitet).sort((a, b) => b.bearbeitet - a.bearbeitet).slice(0, 6);
    const bild = (r) => { const img = el('img', { alt: '' }); thumbUrl(r).then(u => img.src = u); return el('button', { class: 'st-bild', title: r.name, onclick: () => { location.hash = '#/bearbeiten/' + r.id; } }, img, el('span', {}, r.titel || r.name.replace(/\.[^.]+$/, '')), r.farbe ? el('i', { style: { background: farbWert(r.farbe) } }) : null); };
    const kopf = (titel, mehr) => el('div', { class: 'abschnitt-kopf' }, el('h3', {}, titel), mehr ? el('button', { class: 'link', onclick: mehr }, tr('alle') + ' ›') : null);
    wrap.append(el('section', { class: 'bilder-neu' }, kopf(tr('Neu hinzugekommen'), () => { state.sort = 'import'; geh('alle'); }), el('div', { class: 'galerie' }, ...neu.map(bild))));

    // Übersicht: ruhig – Fortschritt statt großer Zahlen, Speicher als schmaler Balken
    const bearbeitetN = recs.filter(r => istBearbeitet(r.edit)).length, sortiert = n - z.unsortiert;
    const balken = (titel, wert, max, ziel, farbe) => el('button', { class: 'fortschritt', onclick: ziel },
      el('span', { class: 'fs-text' }, el('span', {}, titel), el('small', {}, tr('{0} von {1}', wert, max))),
      el('span', { class: 'fs-balken' }, el('i', { style: { width: (max ? Math.round(100 * wert / max) : 0) + '%', background: farbe } })));
    const zahl = (ico, wert, titel, ziel) => el('button', { class: 'zahl', onclick: ziel, title: titel }, svg(ico), el('b', {}, String(wert)), el('span', {}, titel));
    const speicher = el('div', { class: 'speicher-zeile' }, el('span', { class: 'fs-text' }, el('span', {}, tr('Speicher')), el('small', {}, '…')), el('span', { class: 'fs-balken duenn' }, el('i', { style: { width: '0%' } })));
    db.speicherInfo().then(i => { if (!i) return; speicher.querySelector('small').textContent = tr('{0} von {1}', fmtBytes(i.usage || 0), fmtBytes(i.quota || 0)); speicher.querySelector('i').style.width = Math.max(1, Math.min(100, 100 * (i.usage || 0) / (i.quota || 1))) + '%'; });
    wrap.append(el('section', { class: 'uebersicht' },
      el('div', { class: 'zahlen' },
        zahl('bild', n, tr('Bilder'), () => geh('alle')), zahl('kreis', z.unsortiert, tr('Unsortiert'), () => geh('unsortiert')),
        zahl('stern', z.favoriten, tr('Favoriten'), () => geh('favoriten')), zahl('ordner', state.ordner.length, tr('Ordner'), () => geh('alle'))),
      el('div', { class: 'balken-liste' },
        balken(tr('Sortiert'), sortiert, n, () => geh('unsortiert'), 'var(--gruen, #3fb950)'),
        balken(tr('Bearbeitet'), bearbeitetN, n, () => geh('bearbeitet'), '#4da6ff'), speicher)));
    if (zuletzt.length) wrap.append(el('section', { class: 'bilder-zuletzt' }, kopf(tr('Zuletzt bearbeitet'), () => geh('bearbeitet')), el('div', { class: 'galerie klein' }, ...zuletzt.map(bild))));

    // Ordner als Karten mit Vorschau
    const ord = el('section', { class: 'panel' }, el('div', { class: 'kopf' }, el('h3', {}, tr('Deine Ordner')), el('button', { class: 'btn klein', onclick: () => window.BS.ordnerNeu().then(() => zeigen(root)) }, tr('＋ Neuer Ordner'))));
    const kacheln = el('div', { class: 'ordner-karten' });
    if (!state.ordner.length) kacheln.append(el('p', { class: 'hinweis leer' }, tr('Lege Ordner an – z. B. „Bad OG“, „Referenz Webseite“, „Mängel“. Jeder bekommt eine Taste 1–9 zum blitzschnellen Einsortieren.')));
    for (const o of state.ordner) {
      const bilder = recs.filter(r => r.ordner === o.id).slice(0, 4); const mosaik = el('div', { class: 'mosaik' });
      for (let k = 0; k < 4; k++) { const r = bilder[k]; const img = el('img', { alt: '' }); if (r) thumbUrl(r).then(u => img.src = u); mosaik.append(r ? img : el('span')); }
      kacheln.append(el('button', { class: 'ordner-karte', style: { '--of': o.farbe }, onclick: () => geh('ordner:' + o.id) }, mosaik,
        el('div', { class: 'ok-text' }, el('b', {}, o.name), el('small', {}, tr('{0} Bilder', z.ordner[o.id] || 0)), o.taste ? el('kbd', { title: tr('Taste ') + o.taste }, o.taste) : null)));
    }
    ord.append(kacheln); wrap.append(ord);
  }

  // Quellen
  const q = el('section', { class: 'panel' }, el('div', { class: 'kopf' }, el('h3', {}, tr('Bilder holen aus …'))),
    el('div', { class: 'quellen' }, ...QUELLEN.filter(x => x.k !== 'url').map(x => el('button', { class: 'quelle', onclick: () => window.BS.import(x.k) }, el('span', { class: 'q-ico' }, x.i), el('b', {}, x.t), el('small', {}, x.h)))));
  wrap.append(q);
  wrap.append(el('p', { class: 'fusszeile' }, FREI ? tr('Deine Bilder liegen nur in diesem Browser auf diesem Gerät · Originale werden nie verändert') : tr('Deine Bilder liegen sicher in diesem Browser auf diesem PC · Originale werden nie verändert · Stand {0}', fmtDate(Date.now()))));
  if (FREI) wrap.append(herstellerHinweis());
  root.append(el('div', { class: 'start-scroll' }, wrap));
}
void $; void ordner;
