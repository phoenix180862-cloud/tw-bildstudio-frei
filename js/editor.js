// TW Bildstudio – Bearbeiten: Licht, Farbe, Kurven, HSL, Details, Effekte, Zuschnitt/Perspektive, Retusche, Text, Einzeichnen
import { state, bitmap, bearbeitungSpeichern, sichtbareListe, thumbUrl, einstSpeichern, recSpeichern } from './store.js';
import * as E from './engine.js';
import { LOOKS, VERHAELTNISSE, MARKUP_FARBEN, TEXT_FARBEN } from './presets.js';
import { MARKUP_WZ, markupZeichnen, markupTreffer, naechsteNummer, legende } from './markup.js';
import { $, $$, el, esc, toast, clamp, rafThrottle, debounce, infoPunkt, eingabe, uid, bestaetigen } from './util.js';
import { menue } from './library.js';
import { bildCheck, autoVerbessern } from './analyse.js';
import { himmelMaske } from './gl-extra.js';
import * as KIB from './ki-bild.js';
import { FREI } from './frei.js';
import { tr, trz, zahl } from './i18n.js';

// Vorschaugröße: 2400 px (bei sehr langsamen PCs per localStorage „bs_vorschau“ kleiner; bei automatischen Aufnahmen 1200)
const PREV = (() => { try { const v = +localStorage.getItem('bs_vorschau'); if (v >= 600) return v; } catch (e) { } return navigator.webdriver ? 1200 : 2400; })();
let S = null; // Sitzung

const INFO = {
  exposure: tr('Belichtung: macht das ganze Bild heller oder dunkler – wie eine Blende mehr oder weniger.'),
  contrast: tr('Kontrast: Abstand zwischen hell und dunkel. Mehr = knackiger, weniger = weicher/flacher.'),
  highlights: tr('Lichter: nur die hellen Bereiche. Nach links holt ausgefressene Fenster, Himmel oder Glanzstellen auf Fliesen zurück.'),
  shadows: tr('Tiefen: nur die dunklen Bereiche. Nach rechts hellt Ecken, Fugen und Schatten auf, ohne den Rest zu überstrahlen.'),
  whites: tr('Weiß: setzt den hellsten Punkt. Nach rechts wird Weiß wirklich weiß (z. B. weiße Fliesen).'),
  blacks: tr('Schwarz: setzt den dunkelsten Punkt. Nach links wird Schwarz satter, das Bild wirkt kräftiger.'),
  temp: tr('Farbtemperatur: nach links kühler/blauer, nach rechts wärmer/gelber. Gegen Gelbstich von Baustellenlampen nach links.'),
  tint: tr('Tönung: nach links grüner, nach rechts magenta. Gegen Grünstich von Leuchtstoffröhren nach rechts.'),
  vibrance: tr('Dynamik: verstärkt nur die blassen Farben – Hauttöne bleiben natürlich. Meist besser als Sättigung.'),
  saturation: tr('Sättigung: alle Farben gleichmäßig kräftiger oder blasser. Ganz links = Schwarz-Weiß.'),
  clarity: tr('Klarheit: Kontrast in den Mitteltönen. Lässt Strukturen, Fugen und Oberflächen plastisch wirken.'),
  dehaze: tr('Dunst entfernen: holt Kontrast und Farbe aus flauen, milchigen Bildern (Staub, Gegenlicht, Nebel).'),
  sharpen: tr('Schärfen: betont feine Kanten. Für Web 20–40, für Druck etwas mehr. Zu viel erzeugt helle Säume.'),
  noise: tr('Rauschen reduzieren: glättet Körnung bei dunklen Handyfotos. Zu viel macht Flächen wachsartig.'),
  vignette: tr('Vignette: Ränder dunkler (links) oder heller (rechts) – lenkt den Blick zur Bildmitte.'),
  vignetteMid: tr('Mittelpunkt: wie weit die Vignette ins Bild reicht.'),
  grain: tr('Korn: fügt filmartiges Korn hinzu – für einen analogen Look.'),
  grainSize: tr('Korngröße: fein oder grob.'),
  fade: tr('Verblassen: hebt das Schwarz an – matter Retro-Look.'),
  splitShSat: tr('Teiltonung Tiefen: färbt die dunklen Bereiche (Farbton wählen, Stärke einstellen).'),
  splitHiSat: tr('Teiltonung Lichter: färbt die hellen Bereiche.'),
  frame: tr('Rahmen: Rand um das Bild, z. B. weiß für Galerie-/Social-Media-Look.')
};

/** nächstes Werkzeug beim Öffnen des Editors (z. B. „KI“ aus dem Kopf-Knopf) */
let naechstesWz = null;
export function werkzeugOeffnen(k) { if (FREI && k === 'ki') return; if (aktiv()) wzWahl(k); else naechstesWz = k; }
export function zeigen(root, id) {
  const liste = sichtbareListe(); const rec = state.recs.get(id) || state.recs.get(state.fokus) || liste[0];
  root.innerHTML = '';
  if (!rec) { root.append(el('div', { class: 'leer-box' }, el('h2', {}, tr('Kein Bild gewählt')), el('p', {}, tr('Wähle in der Bibliothek ein Bild aus (Doppelklick oder Taste E).')), el('div', { class: 'zeile' }, el('a', { class: 'btn primaer', href: '#/bibliothek' }, tr('Zur Bibliothek'))))); return; }
  state.fokus = rec.id; if (!state.auswahl.has(rec.id)) { state.auswahl.clear(); state.auswahl.add(rec.id); }
  S = { rec, edit: E.normalisiereBearbeitung(rec.edit), undo: [], redo: [], wz: S?.wz && S.wz !== 'zuschnitt' ? S.wz : 'anpassen', zoom: 0, panX: 0, panY: 0, vergleich: 0, split: 0.5, cache: {}, auswahlText: null, auswahlMarkup: null, markupWz: 'pfeil', markupFarbe: '#e5242a', markupStaerke: 4, markupFuellung: 0, healGroesse: 3, healArt: 'heal', cloneQuelle: null, kanal: 'rgb', hslModus: 0, offen: S?.offen || { schnell: true, licht: true, farbe: true }, geaendert: false };
  root.append(el('div', { class: 'ed' },
    el('div', { class: 'ed-werkzeuge', id: 'edWz' }),
    el('div', { class: 'ed-mitte' },
      el('div', { class: 'ed-oben', id: 'edOben' }),
      el('div', { class: 'ed-buehne', id: 'buehne' }, el('canvas', { class: 'bild', id: 'edBild' }), el('canvas', { class: 'ueber', id: 'edUeber' }), el('div', { class: 'ed-laden', id: 'edLaden' }, tr('Bild wird geladen …'))),
      el('div', { class: 'ed-unten', id: 'filmstreifen' })),
    el('div', { class: 'ed-panel', id: 'edPanel' })));
  if (naechstesWz) { S.wz = naechstesWz; naechstesWz = null; }
  werkzeugleiste(); obenLeiste(); filmstreifen(liste); buehneEreignisse();
  laden();
}
export const aktiv = () => S && document.getElementById('edBild') ? S : null;

async function laden() {
  const s = S;
  try { s.bmp = await bitmap(s.rec); } catch (e) { $('#edLaden').textContent = tr('Bild konnte nicht geladen werden: ') + e.message; return; }
  if (s !== S) return; $('#edLaden').remove();
  neuGeo(); panel(); einpassen();
}

/* ═════════ Rendering mit Zwischenspeichern ═════════ */
const geoKey = () => JSON.stringify(S.edit.geo) + (S.wz === 'zuschnitt' ? ':voll' : '');
function neuGeo() {
  const G = E.gl(); G.quelle(S.bmp, S.rec.id);
  const voll = S.wz === 'zuschnitt';
  const g = G.geometrie(S.edit.geo, PREV, PREV, voll); S.cache.geo = g; S.cache.geoKey = geoKey(); S.cache.healKey = null;
  neuHeal();
}
const healKey = () => JSON.stringify(S.edit.heal) + '|' + (S.wz === 'zuschnitt' ? '' : JSON.stringify(S.edit.deblur));
const skala = () => S.cache.geo ? S.cache.geo.w / (S.cache.geo.cw || S.cache.geo.w) : 1;
function neuHeal() {
  const g = S.cache.geo; let c = document.createElement('canvas'); c.width = g.canvas.width; c.height = g.canvas.height; c.getContext('2d').drawImage(g.canvas, 0, 0);
  if (S.wz !== 'zuschnitt') {
    E.retusche(c, S.edit.heal); S.cache.roh = c; // ohne Entfaltung – Grundlage für Bild-Check und KI
    if (S.edit.deblur?.art && S.edit.deblur.art !== 'aus') { const t0 = performance.now(); c = E.entfalten(c, S.edit.deblur, skala()); S.cache.deblurMs = performance.now() - t0; }
  } else S.cache.roh = c;
  S.cache.heal = c; S.cache.healKey = healKey(); S.cache.healNurKey = JSON.stringify(S.edit.heal); S.cache.besitzer = 'ed:' + uid();
  E.gl().arbeitsbild(c, S.cache.besitzer); zeichnen(true);
}
function sicherGL() { const G = E.gl(); if (G.besitzer !== S.cache.besitzer) { G.quelle(S.bmp, S.rec.id); G.arbeitsbild(S.cache.heal, S.cache.besitzer); } return G; }
/** Hauptbild zeichnen (Farbe → Ebenen) */
function zeichnen(histo = false) {
  if (!S || !S.cache.heal) return; const cv = $('#edBild'); if (!cv) return;
  if (geoKey() !== S.cache.geoKey) return neuGeo();
  if (S.cache.healKey !== healKey()) {
    // nur die Unschärfe-Rettung geändert → rechenintensiv, daher kurz abwarten (Regler ziehen bleibt flüssig)
    if (S.cache.healNurKey === JSON.stringify(S.edit.heal)) { clearTimeout(S.dbT); S.dbT = setTimeout(() => { if (S && S.cache.healKey !== healKey()) neuHeal(); }, 260); }
    else return neuHeal();
  }
  const G = sicherGL(); const vorher = S.vergleich === 2 || S.vorherHalten;
  let out = vorher ? S.cache.geo.canvas : G.farbe(S.edit);
  if (!vorher && S.wz !== 'zuschnitt' && S.edit.masken.length) out = E.lokal(out, S.edit.masken, { zeigen: S.wz === 'masken' && S.maskeZeigen && S.maskeIdx != null ? S.maskeIdx : -1 });
  const w = out.width, h = out.height; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; transform(); }
  const x = cv.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(out, 0, 0);
  if (S.vergleich === 1 && !vorher) { const sx = Math.round(w * S.split); x.drawImage(S.cache.geo.canvas, 0, 0, sx, h, 0, 0, sx, h); }
  if (S.wz !== 'zuschnitt' && !vorher) {
    markupZeichnen(x, S.edit.markup, w, h, { auswahl: S.wz === 'markup' ? S.auswahlMarkup : null });
    E.textZeichnen(x, S.edit.text, w, h);
  }
  ueberZeichnen();
  if (histo || !S.histoT) { clearTimeout(S.histoT); S.histoT = setTimeout(() => { S.histoT = null; const hc = $('#histo'); if (hc && S) E.histogrammZeichnen(hc, E.histogramm(cv)); }, 120); }
}
const zeichnenBald = rafThrottle(() => zeichnen());

/* ═════════ Ansicht: Zoom & Verschieben ═════════ */
function transform() {
  const cv = $('#edBild'), b = $('#buehne'); if (!cv || !b) return;
  const bw = b.clientWidth, bh = b.clientHeight, w = cv.width, h = cv.height;
  const fit = Math.min(bw / w, bh / h) * 0.94; const z = S.zoom || fit; S.fit = fit; S.z = z;
  const x = (bw - w * z) / 2 + S.panX, y = (bh - h * z) / 2 + S.panY;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.transform = `translate(${x}px,${y}px) scale(${z})`;
  const u = $('#edUeber'); u.width = bw * devicePixelRatio; u.height = bh * devicePixelRatio; u.style.width = bw + 'px'; u.style.height = bh + 'px';
  S.off = { x, y }; ueberZeichnen(); const zl = $('#zoomWert'); if (zl) zl.textContent = Math.round(z * 100 * (S.cache.geo ? S.cache.geo.cw / S.cache.geo.w : 1) * (S.wz === 'zuschnitt' ? 1 : 1)) + ' %';
}
function einpassen() { S.zoom = 0; S.panX = 0; S.panY = 0; transform(); }
/** Bildschirm → Bild (0–1) */
function nachBild(e) { const r = $('#edBild').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
/** Bild (0–1) → Überlagerung (CSS-Pixel) */
function nachSchirm(nx, ny) { const cv = $('#edBild'); return [S.off.x + nx * cv.width * S.z, S.off.y + ny * cv.height * S.z]; }

/* ═════════ Überlagerung: Zuschnitt-Rahmen, Pinsel, Retusche-Punkte, Text-Auswahl ═════════ */
function ueberZeichnen() {
  const u = $('#edUeber'); if (!u || !S.off) return; const x = u.getContext('2d'), d = devicePixelRatio; x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, u.width, u.height);
  const cv = $('#edBild'), W = cv.width * S.z, H = cv.height * S.z;
  if (S.wz === 'zuschnitt') {
    const c = S.edit.geo.crop || { x: 0, y: 0, w: 1, h: 1 }; const [x0, y0] = nachSchirm(c.x, c.y), w = c.w * W, h = c.h * H;
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.rect(S.off.x, S.off.y, W, H); x.rect(x0, y0, w, h); x.fill('evenodd');
    x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.strokeRect(x0, y0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1; x.beginPath();
    const n = S.rasterFein ? 8 : 3; for (let i = 1; i < n; i++) { x.moveTo(x0 + w * i / n, y0); x.lineTo(x0 + w * i / n, y0 + h); x.moveTo(x0, y0 + h * i / n); x.lineTo(x0 + w, y0 + h * i / n); } x.stroke();
    x.fillStyle = '#fff'; for (const [hx, hy] of griffe(c)) { const [sx, sy] = nachSchirm(hx, hy); x.fillRect(sx - 6, sy - 6, 12, 12); }
    if (S.ausrichtLinie) { x.strokeStyle = '#facc15'; x.lineWidth = 2; x.beginPath(); const [a, b] = S.ausrichtLinie; const p = nachSchirm(...a), q = nachSchirm(...b); x.moveTo(...p); x.lineTo(...q); x.stroke(); }
  }
  if (S.wz === 'retusche') {
    for (const op of S.edit.heal) {
      const [cx, cy] = nachSchirm(op.x, op.y), [sx, sy] = nachSchirm(op.sx, op.sy), r = op.r * W;
      x.strokeStyle = op === S.healAuswahl ? '#facc15' : 'rgba(255,255,255,.8)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      if (op === S.healAuswahl || S.healAlleQuellen) { x.setLineDash([4, 3]); x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(cx, cy); x.lineTo(sx, sy); x.stroke(); x.setLineDash([]); }
    }
    if (S.maus) { const r = S.healGroesse / 100 * W; x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(S.maus[0], S.maus[1], r, 0, Math.PI * 2); x.stroke(); x.strokeStyle = '#000'; x.beginPath(); x.arc(S.maus[0], S.maus[1], r + 1, 0, Math.PI * 2); x.stroke(); }
    if (S.cloneQuelle) { const [qx, qy] = nachSchirm(...S.cloneQuelle); x.strokeStyle = '#facc15'; x.beginPath(); x.moveTo(qx - 8, qy); x.lineTo(qx + 8, qy); x.moveTo(qx, qy - 8); x.lineTo(qx, qy + 8); x.stroke(); }
  }
  if (S.wz === 'text' && S.auswahlText) {
    const t = S.auswahlText, c2 = document.createElement('canvas').getContext('2d'); const m = E.textMasse(c2, t, cv.width, cv.height);
    const [rx, ry] = nachSchirm(m.rect[0] / cv.width, m.rect[1] / cv.height); x.strokeStyle = '#facc15'; x.setLineDash([5, 4]); x.lineWidth = 1.5; x.strokeRect(rx - 4, ry - 4, m.rect[2] * S.z + 8, m.rect[3] * S.z + 8); x.setLineDash([]);
  }
  if (S.wz === 'markup' && S.zeichnet) {
    const m = S.zeichnet; x.save(); x.translate(S.off.x, S.off.y); x.scale(S.z, S.z); markupZeichnen(x, [m], cv.width, cv.height); x.restore();
    if (m.t === 'flaeche' && S.maus) { const l = m.pts[m.pts.length - 1], [ax, ay] = nachSchirm(...l); x.strokeStyle = m.farbe; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(ax, ay); x.lineTo(S.maus[0], S.maus[1]); x.stroke(); x.setLineDash([]); }
  }
  if (S.wz === 'masken') maskenUeber(x, W, H);
  if (S.wz === 'ki' && (S.kiStriche?.length || S.kiZeichnet)) { x.save(); x.translate(S.off.x, S.off.y); x.globalAlpha = 0.5; for (const st of [...(S.kiStriche || []), ...(S.kiZeichnet ? [S.kiZeichnet] : [])]) { x.strokeStyle = '#ff2020'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = st.r * 2 * Math.min(W, H); x.beginPath(); st.pts.forEach(([a, b], i) => i ? x.lineTo(a * W, b * H) : x.moveTo(a * W, b * H)); if (st.pts.length === 1) x.lineTo(st.pts[0][0] * W + 0.1, st.pts[0][1] * H); x.stroke(); } x.restore(); }
  if (S.wz === 'ki' && S.kiMalen && S.maus) { const r = S.kiPinsel / 100 * Math.min(W, H); x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(S.maus[0], S.maus[1], r, 0, Math.PI * 2); x.stroke(); }
  if (S.pipette && S.maus) { x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(S.maus[0], S.maus[1], 9, 0, Math.PI * 2); x.moveTo(S.maus[0] - 14, S.maus[1]); x.lineTo(S.maus[0] + 14, S.maus[1]); x.moveTo(S.maus[0], S.maus[1] - 14); x.lineTo(S.maus[0], S.maus[1] + 14); x.stroke(); }
}
function griffe(c) { return [[c.x, c.y], [c.x + c.w / 2, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h / 2], [c.x + c.w, c.y + c.h], [c.x + c.w / 2, c.y + c.h], [c.x, c.y + c.h], [c.x, c.y + c.h / 2]]; }

/* ═════════ Änderungen, Rückgängig, Speichern ═════════ */
let burst = null;
function vorAenderung() { if (!burst) { S.undo.push(JSON.stringify(S.edit)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; } clearTimeout(burst); burst = setTimeout(() => burst = null, 600); }
function aendern(fn, { neuPanel = false } = {}) { vorAenderung(); fn(S.edit); S.geaendert = true; zeichnenBald(); speichernBald(); if (neuPanel) panel(); undoKnoepfe(); if (S.wz === 'anpassen') checkBald(); }
const speichernBald = debounce(() => speichern(), 1500);
export async function speichern() {
  if (!S || !S.geaendert) return; const s = S; s.geaendert = false;
  await bearbeitungSpeichern(s.rec, s.edit);
  const fs = $(`#filmstreifen [data-id="${s.rec.id}"] img`); if (fs) fs.src = await thumbUrl(s.rec);
}
function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.edit)); S.edit = JSON.parse(S.undo.pop()); S.geaendert = true; zeichnen(true); panel(); speichernBald(); undoKnoepfe(); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.edit)); S.edit = JSON.parse(S.redo.pop()); S.geaendert = true; zeichnen(true); panel(); speichernBald(); undoKnoepfe(); }
function undoKnoepfe() { $('#bUndo')?.classList.toggle('aus', !S.undo.length); $('#bRedo')?.classList.toggle('aus', !S.redo.length); }

/* ═════════ Leisten ═════════ */
const WZ = [
  { k: 'anpassen', i: '☀', t: tr('Licht & Farbe'), h: tr('Belichtung, Farbe, Kurven, Looks (A)'), key: 'a' },
  { k: 'zuschnitt', i: '⬚', t: tr('Zuschnitt'), h: tr('Zuschneiden, Format, Drehen, Geraderichten, Perspektive (C)'), key: 'c' },
  { k: 'retusche', i: '✚', t: tr('Retusche'), h: tr('Flecken, Staub, Kabel entfernen – Reparieren & Stempel (J)'), key: 'j' },
  { k: 'markup', i: '➚', t: tr('Einzeichnen'), h: tr('Pfeile, Rahmen, Wolken, Flächen, Maße, Nummern – Vorschläge für den Bauherrn (M)'), key: 'm' },
  { k: 'text', i: 'T', t: tr('Text'), h: tr('Text, Überschriften, Hinweise ins Bild (T)'), key: 't' },
  { k: 'masken', i: '◑', t: tr('Masken'), h: tr('Lokale Anpassungen: nur Himmel, nur eine Ecke, nur die Wand – Verlauf, Radial, Pinsel, Himmel (K)'), key: 'k' },
  { k: 'ki', i: '✦', t: 'KI', h: tr('KI-Werkstatt: hochrechnen, KI-Schärfen, Objekte entfernen, Licht, Hintergrund … (I)'), key: 'i' }
].filter(w => !FREI || w.k !== 'ki'); // kostenlose Fassung: ohne KI-Werkstatt (auch Taste I)
function werkzeugleiste() {
  const box = $('#edWz'); box.innerHTML = '';
  for (const w of WZ) box.append(el('button', { class: 'wz' + (S.wz === w.k ? ' an' : ''), title: w.h, 'data-wz': w.k, onclick: () => wzWahl(w.k) }, w.i, el('small', {}, w.t)));
  box.append(el('hr'), el('button', { class: 'wz', title: tr('Vorher / Nachher (\\ halten)'), onclick: () => { S.vergleich = (S.vergleich + 1) % 3; zeichnen(); obenLeiste(); } }, '◐', el('small', {}, tr('Vergleich'))),
    el('button', { class: 'wz', title: tr('Bearbeitung kopieren (Strg+Umschalt+C)'), onclick: () => window.BS.kopieren(S.rec.id) }, '⧉', el('small', {}, tr('Kopieren'))),
    el('button', { class: 'wz', title: tr('Auf andere Bilder übertragen'), onclick: () => window.BS.uebertragen(S.rec.id) }, '⇉', el('small', {}, tr('Übertragen'))));
}
function wzWahl(k) {
  if (FREI && k === 'ki') return;
  if (S.wz === k) return; const vorher = S.wz; S.wz = k; S.auswahlText = null; S.auswahlMarkup = null; S.zeichnet = null; S.pipette = false;
  werkzeugleiste(); panel(); if (vorher === 'zuschnitt' || k === 'zuschnitt') { neuGeo(); einpassen(); } else zeichnen();
  $('#buehne').style.cursor = k === 'retusche' ? 'none' : k === 'markup' || k === 'masken' ? 'crosshair' : 'default';
  if (vorher === 'zuschnitt' || k === 'zuschnitt') return; if (k === 'masken' && S.maskeIdx == null && S.edit.masken.length) { S.maskeIdx = 0; panel(); }
}
function obenLeiste() {
  const b = $('#edOben'); if (!b) return; b.innerHTML = '';
  const liste = sichtbareListe(), i = liste.findIndex(r => r.id === S.rec.id);
  b.append(
    el('a', { class: 'btn', href: '#/bibliothek', title: tr('Zurück zur Bibliothek (Esc)') }, tr('◀ Bibliothek')),
    el('button', { class: 'ib', title: tr('Vorheriges Bild (Strg+←)'), onclick: () => nachbar(-1) }, '‹'), el('button', { class: 'ib', title: tr('Nächstes Bild (Strg+→)'), onclick: () => nachbar(1) }, '›'),
    el('span', { class: 'nm', title: S.rec.name }, S.rec.name), el('span', { class: 'dim' }, `${S.rec.w}×${S.rec.h}` + (i >= 0 ? ` · ${i + 1}/${liste.length}` : '')),
    el('span', { class: 'platz' }),
    el('button', { class: 'ib', id: 'bUndo', title: tr('Rückgängig (Strg+Z)'), onclick: undo }, '↶'), el('button', { class: 'ib', id: 'bRedo', title: tr('Wiederholen (Strg+Y)'), onclick: redo }, '↷'),
    el('button', { class: 'btn klein' + (S.vergleich ? ' an' : ''), title: tr('Vorher/Nachher: aus → geteilt → vorher (Taste \\ gedrückt halten = kurz vorher)'), onclick: () => { S.vergleich = (S.vergleich + 1) % 3; zeichnen(); obenLeiste(); } }, [tr('◐ Vergleich'), tr('◐ geteilt'), tr('◐ vorher')][S.vergleich]),
    el('button', { class: 'btn klein', title: tr('Einpassen (0)'), onclick: einpassen }, tr('Einpassen')), el('button', { class: 'btn klein', title: '100 % (1)', onclick: () => zoomAuf(1 / (S.cache.geo.cw / S.cache.geo.w)) }, '1:1'), el('span', { class: 'dim', id: 'zoomWert' }),
    el('button', { class: 'btn klein', title: tr('Alle Bearbeitungen dieses Bildes zurücksetzen'), onclick: async () => { if (await bestaetigen(tr('Alle Bearbeitungen dieses Bildes zurücksetzen? (Rückgängig geht trotzdem)'))) aendern(e => Object.assign(e, E.neueBearbeitung()), { neuPanel: true }); } }, tr('↺ Zurücksetzen')),
    el('button', { class: 'btn', title: tr('Drucken (Strg+P)'), onclick: async () => { await speichern(); window.BS.drucken([S.rec.id]); } }, '🖨'),
  );
  undoKnoepfe(); transform();
}
async function nachbar(d) {
  const liste = sichtbareListe(); const i = liste.findIndex(r => r.id === S.rec.id); const n = liste[i + d]; if (!n) return;
  await speichern(); location.hash = '#/bearbeiten/' + n.id;
}
async function filmstreifen(liste) {
  const box = $('#filmstreifen'); box.innerHTML = '';
  for (const r of liste.slice(0, 400)) { const img = el('img', { alt: '' }); const d = el('div', { class: 'fs' + (r.id === S.rec.id ? ' an' : ''), dataset: { id: r.id }, title: r.name, onclick: async () => { await speichern(); location.hash = '#/bearbeiten/' + r.id; } }, img); box.append(d); thumbUrl(r).then(u => img.src = u); }
  box.querySelector('.fs.an')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ═════════ Panel ═════════ */
function sektion(id, titel, inhalt, extra) {
  const zu = ['kurven', 'hsl', 'effekte', 'rahmen', 'info']; const auf = S.offen[id] ?? !zu.includes(id);
  const s = el('div', { class: 'sek' + (auf ? ' auf' : ''), dataset: { hilfeOrt: id } }, el('h4', { onclick: (e) => { if (e.target.closest('.ib')) return; S.offen[id] = !s.classList.contains('auf'); s.classList.toggle('auf'); } }, titel, extra || null), el('div', { class: 'inh' }, ...[].concat(inhalt)));
  return s;
}
function regler(label, ziel, key, min, max, { schritt = 1, info, grad, null: nullWert = 0, fmt } = {}) {
  const wert = () => ziel()[key] ?? nullWert;
  const r = el('input', { type: 'range', min, max, step: schritt, value: wert(), style: grad ? `--grad:${grad}` : '' });
  const n = el('input', { type: 'number', min, max, step: schritt, value: wert() });
  const box = el('div', { class: 'regler' + (wert() !== nullWert ? ' geaendert' : '') }, el('label', {}, label, info ? infoPunkt(info, 'bearbeiten-licht') : null), n, r);
  const setze = (v) => { v = clamp(+v, min, max); aendern(() => { ziel()[key] = v; }); r.value = v; n.value = v; box.classList.toggle('geaendert', v !== nullWert); };
  r.addEventListener('input', () => setze(r.value)); n.addEventListener('change', () => setze(n.value));
  r.addEventListener('dblclick', () => setze(nullWert)); box.querySelector('label').addEventListener('dblclick', () => setze(nullWert));
  box.title = tr('Doppelklick = zurücksetzen'); void fmt;
  return box;
}
const adj = () => S.edit.adj;
function panel() {
  const p = $('#edPanel'); if (!p) return; const st = p.scrollTop; p.innerHTML = '';
  const h = el('canvas', { id: 'histo', width: 300, height: 74 }); const x = S.rec.exif || {};
  p.append(el('div', { class: 'histo' }, h, el('div', { class: 'exif' }, ...[x.kamera, x.brennweite, x.blende, x.belichtung, x.iso ? tr('ISO ') + x.iso : ''].filter(Boolean).map(t => el('span', {}, t)))));
  ({ anpassen: panelAnpassen, zuschnitt: panelZuschnitt, retusche: panelRetusche, text: panelText, markup: panelMarkup, masken: panelMasken, ki: panelKI })[S.wz](p);
  p.scrollTop = st; if (S.cache.heal) zeichnen(true);
}
function panelAnpassen(p) {
  const looks = el('div', { class: 'looks' });
  const alleLooks = [...LOOKS, ...(state.einst.eigeneLooks || [])];
  p.append(checkSektion());
  p.append(sektion('schnell', tr('Schnell & Looks'), [
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'btn', title: tr('Nur Belichtung, Weißabgleich und Kontrast automatisch optimieren'), onclick: () => { const w = E.autoWerte(S.cache.roh || S.cache.heal); aendern(e => Object.assign(e.adj, w), { neuPanel: true }); toast(tr('Licht & Farbe automatisch optimiert – fein nachregeln mit den Reglern')); } }, tr('☀ Auto Licht/Farbe')),
      el('button', { class: 'btn', title: tr('Weißabgleich: auf eine Stelle klicken, die neutral grau/weiß sein soll (z. B. weiße Fuge, Wand)'), onclick: () => { S.pipette = true; $('#buehne').style.cursor = 'crosshair'; toast(tr('Klick ins Bild auf etwas Weißes oder Graues')); } }, tr('💧 Weißabgleich')),
      el('button', { class: 'btn', title: tr('Aktuelle Einstellungen als eigenen Look speichern'), onclick: lookSpeichern }, tr('＋ Look'))),
    looks, el('p', { class: 'hinweis' }, tr('Ein Look setzt Licht & Farbe neu. Danach mit den Reglern feinjustieren.'))
  ], infoPunkt(tr('Looks sind fertige Bildstile. Ein Klick probiert ihn aus – rückgängig mit Strg+Z.'), 'bearbeiten-looks')));
  lookVorschau(looks, alleLooks);
  p.append(sektion('licht', tr('Licht'), [
    regler(tr('Belichtung'), adj, 'exposure', -100, 100, { info: INFO.exposure, grad: 'linear-gradient(90deg,#111,#eee)' }),
    regler(tr('Kontrast'), adj, 'contrast', -100, 100, { info: INFO.contrast }),
    regler(tr('Lichter'), adj, 'highlights', -100, 100, { info: INFO.highlights }), regler(tr('Tiefen'), adj, 'shadows', -100, 100, { info: INFO.shadows }),
    regler(tr('Weiß'), adj, 'whites', -100, 100, { info: INFO.whites }), regler(tr('Schwarz'), adj, 'blacks', -100, 100, { info: INFO.blacks })]));
  p.append(sektion('farbe', tr('Farbe'), [
    regler(tr('Temperatur'), adj, 'temp', -100, 100, { info: INFO.temp, grad: 'linear-gradient(90deg,#3b6fd8,#ddd,#e0b030)' }),
    regler(tr('Tönung'), adj, 'tint', -100, 100, { info: INFO.tint, grad: 'linear-gradient(90deg,#3c9a3c,#ddd,#c040c0)' }),
    regler(tr('Dynamik'), adj, 'vibrance', -100, 100, { info: INFO.vibrance }), regler(tr('Sättigung'), adj, 'saturation', -100, 100, { info: INFO.saturation, grad: 'linear-gradient(90deg,#888,#e33,#fd2,#3c3,#39f)' }),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!S.edit.adj.bw, onchange: (e) => aendern(ed => ed.adj.bw = e.target.checked ? 1 : 0) }), tr('Schwarz-Weiß'))]));
  p.append(sektion('kurven', tr('Gradationskurve'), kurvenEditor(), infoPunkt(tr('Kurve: Punkt anklicken und ziehen. Unten = dunkle Töne, oben = helle. Leichtes S = mehr Kontrast. Doppelklick auf einen Punkt löscht ihn. Kanäle R/G/B für Farbkorrekturen.'), 'bearbeiten-kurven')));
  p.append(sektion('hsl', tr('Farbmischer (HSL)'), hslEditor(), infoPunkt(tr('Einzelne Farben gezielt ändern: z. B. das Blau im Pool kräftiger, das Gelb einer Wand blasser, Grün der Hecke dunkler.'), 'bearbeiten-hsl')));
  p.append(sektion('details', tr('Schärfe & Details'), [
    regler(tr('Klarheit'), adj, 'clarity', -100, 100, { info: INFO.clarity }), regler(tr('Dunst entfernen'), adj, 'dehaze', -100, 100, { info: INFO.dehaze }),
    regler(tr('Schärfen'), adj, 'sharpen', 0, 100, { info: INFO.sharpen }), regler(tr('Rauschen reduzieren'), adj, 'noise', 0, 100, { info: INFO.noise })], infoPunkt(tr('Schärfen betont vorhandene Kanten. Ist ein Foto wirklich unscharf (falsch fokussiert oder verwackelt), hilft darunter die Unschärfe-Rettung – sie rechnet die Unschärfe zurück.'), 'bearbeiten-schaerfe')));
  p.append(rettungSektion());
  p.append(sektion('effekte', tr('Effekte'), [
    regler(tr('Vignette'), adj, 'vignette', -100, 100, { info: INFO.vignette }), regler(tr('Mittelpunkt'), adj, 'vignetteMid', 0, 100, { info: INFO.vignetteMid, null: 50 }),
    regler(tr('Korn'), adj, 'grain', 0, 100, { info: INFO.grain }), regler(tr('Korngröße'), adj, 'grainSize', 0, 100, { info: INFO.grainSize, null: 25 }),
    regler(tr('Verblassen'), adj, 'fade', 0, 100, { info: INFO.fade }),
    regler(tr('Tiefen-Farbton'), adj, 'splitShHue', 0, 360, { grad: 'linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)', null: 220 }), regler(tr('Tiefen-Stärke'), adj, 'splitShSat', 0, 100, { info: INFO.splitShSat }),
    regler(tr('Lichter-Farbton'), adj, 'splitHiHue', 0, 360, { grad: 'linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)', null: 40 }), regler(tr('Lichter-Stärke'), adj, 'splitHiSat', 0, 100, { info: INFO.splitHiSat })]));
  p.append(sektion('rahmen', tr('Rahmen'), [
    regler(tr('Rahmenbreite %'), () => S.edit.frame, 'width', 0, 15, { schritt: 0.5, info: INFO.frame }),
    el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Farbe')), el('input', { type: 'color', value: S.edit.frame.color || '#ffffff', oninput: (e) => aendern(ed => ed.frame.color = e.target.value) }),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!S.edit.frame.linie, onchange: (e) => aendern(ed => ed.frame.linie = e.target.checked) }), tr('feine Linie'))),
    el('p', { class: 'hinweis' }, tr('Der Rahmen erscheint beim Export und Druck.'))]));
  p.append(sektion('info', tr('Bildtitel & Stichwörter'), [
    el('label', { class: 'lbl' }, tr('Titel / Bildbeschreibung (für Webseite: Alt-Text)')), el('textarea', { class: 'inp', rows: 2, style: 'width:100%', oninput: debounce((e) => { S.rec.titel = e.target.value; recSpeichern(S.rec); }, 600) }, S.rec.titel || ''),
    el('label', { class: 'lbl' }, tr('Stichwörter (mit Komma getrennt)')), el('input', { class: 'inp', style: 'width:100%', value: (S.rec.stichworte || []).join(', '), oninput: debounce((e) => { S.rec.stichworte = e.target.value.split(',').map(s => s.trim()).filter(Boolean); recSpeichern(S.rec); }, 600) })], infoPunkt(tr('Titel und Stichwörter helfen beim Wiederfinden (Suche oben). Der Titel wird beim Export als Bildbeschreibung in die Datei geschrieben.'))));
}
async function lookVorschau(box, looks) {
  const src = S.cache.heal; if (!src) { setTimeout(() => S && lookVorschau(box, looks), 300); return; }
  const k = 150, f = Math.min(1, k / Math.max(src.width, src.height)); const small = document.createElement('canvas'); small.width = Math.round(src.width * f); small.height = Math.round(src.height * f); small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
  const G = E.gl(); G.arbeitsbild(small, 'looks');
  const mk = (look) => { const ed = lookAnwenden(E.normalisiereBearbeitung(null), look); const out = G.farbe(ed); const c = el('canvas', { width: small.width, height: small.height }); c.getContext('2d').drawImage(out, 0, 0); return c; };
  box.append(el('div', { class: 'look' + (!S.edit.look ? ' an' : ''), title: tr('Ohne Look (Licht & Farbe zurücksetzen)'), onclick: () => aendern(e => { lookAnwenden(e, null); }, { neuPanel: true }) }, mk(null), el('span', {}, tr('Original'))));
  for (const l of looks) box.append(el('div', { class: 'look' + (S.edit.look === l.id ? ' an' : ''), title: l.name, onclick: () => aendern(e => { lookAnwenden(e, l); }, { neuPanel: true }) }, mk(l), el('span', {}, l.name)));
  G.besitzer = 'looks'; zeichnen();
}
function lookAnwenden(e, look) {
  e.adj = { ...E.ADJ_DEFAULT, ...(look?.adj || {}) };
  e.hsl = Object.fromEntries(E.HSL_FARBEN.map(f => [f.k, (look?.hsl?.[f.k] || [0, 0, 0]).slice()]));
  e.curves = { rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]], ...(look?.curves ? JSON.parse(JSON.stringify(look.curves)) : {}) };
  e.look = look?.id || ''; return e;
}
async function lookSpeichern() {
  const name = await eingabe(tr('Eigenen Look speichern'), '', tr('Name des Looks (z. B. „Referenz Bad“)')); if (!name) return;
  state.einst.eigeneLooks = [...(state.einst.eigeneLooks || []), { id: 'eigen-' + uid(), name, adj: { ...S.edit.adj }, hsl: JSON.parse(JSON.stringify(S.edit.hsl)), curves: JSON.parse(JSON.stringify(S.edit.curves)) }];
  await einstSpeichern(); toast(tr('Look „{0}“ gespeichert', name)); panel();
}

/* ───── Gradationskurve ───── */
function kurvenEditor() {
  const kanaele = [['rgb', 'RGB', '#ddd'], ['r', tr('Rot'), '#ef4444'], ['g', tr('Grün'), '#22c55e'], ['b', tr('Blau'), '#3b82f6']];
  const cv = el('canvas', { width: 280, height: 280 });
  const tabs = el('div', { class: 'tabs' }, ...kanaele.map(([k, t]) => el('button', { class: S.kanal === k ? 'an' : '', onclick: (e) => { S.kanal = k; $$('button', tabs).forEach(b => b.classList.remove('an')); e.target.classList.add('an'); mal(); } }, t)));
  const pts = () => S.edit.curves[S.kanal];
  const mal = () => {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height; x.clearRect(0, 0, W, H);
    const hc = S.cache.heal && E.histogramm(S.cache.heal); if (hc) { let m = 1; for (let i = 3; i < 253; i++) m = Math.max(m, hc.l[i]); x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.moveTo(0, H); for (let i = 0; i < 256; i++) x.lineTo(i / 255 * W, H - Math.min(1, Math.sqrt(hc.l[i] / m)) * H); x.lineTo(W, H); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.beginPath(); for (let i = 1; i < 4; i++) { x.moveTo(W * i / 4, 0); x.lineTo(W * i / 4, H); x.moveTo(0, H * i / 4); x.lineTo(W, H * i / 4); } x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.moveTo(0, H); x.lineTo(W, 0); x.stroke();
    const farbe = kanaele.find(k => k[0] === S.kanal)[2]; const L = E.kurveLUT(pts());
    x.strokeStyle = farbe; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 256; i++) { const px = i / 255 * W, py = H - L[i] * H; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    for (const [px, py] of pts()) { x.fillStyle = farbe; x.strokeStyle = '#000'; x.beginPath(); x.arc(px * W, H - py * H, 6, 0, Math.PI * 2); x.fill(); x.stroke(); }
  };
  let zieh = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; };
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e); const p = pts(); let i = p.findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 0.05);
    vorAenderung();
    if (i < 0) { p.push([x, y]); p.sort((a, b) => a[0] - b[0]); i = p.findIndex(q => q[0] === x && q[1] === y); }
    zieh = i; cv.setPointerCapture(e.pointerId); S.geaendert = true; zeichnenBald(); mal();
  });
  cv.addEventListener('pointermove', (e) => {
    if (zieh == null) return; const [x, y] = pos(e); const p = pts(); const lo = zieh > 0 ? p[zieh - 1][0] + 0.01 : 0, hi = zieh < p.length - 1 ? p[zieh + 1][0] - 0.01 : 1;
    p[zieh] = [zieh === 0 ? Math.min(x, hi) : zieh === p.length - 1 ? Math.max(x, lo) : clamp(x, lo, hi), y]; vorAenderung(); S.geaendert = true; zeichnenBald(); mal();
  });
  cv.addEventListener('pointerup', () => { zieh = null; speichernBald(); undoKnoepfe(); });
  cv.addEventListener('dblclick', (e) => { const [x, y] = pos(e); const p = pts(); const i = p.findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 0.05); if (i > 0 && i < p.length - 1) { aendern(() => p.splice(i, 1)); mal(); } });
  setTimeout(mal, 50);
  const vorlagen = el('div', { class: 'knopfreihe' },
    el('button', { class: 'btn klein', onclick: () => { aendern(e => e.curves[S.kanal] = [[0, 0], [0.25, 0.2], [0.75, 0.82], [1, 1]]); mal(); } }, tr('S-Kurve')),
    el('button', { class: 'btn klein', onclick: () => { aendern(e => e.curves[S.kanal] = [[0, 0.07], [0.5, 0.52], [1, 0.95]]); mal(); } }, tr('Matt')),
    el('button', { class: 'btn klein', onclick: () => { aendern(e => e.curves[S.kanal] = [[0, 0], [0.5, 0.6], [1, 1]]); mal(); } }, tr('Aufhellen')),
    el('button', { class: 'btn klein', onclick: () => { aendern(e => e.curves[S.kanal] = [[0, 0], [1, 1]]); mal(); } }, tr('Gerade')));
  return [tabs, el('div', { class: 'kurve-box' }, cv), vorlagen];
}
/* ───── HSL ───── */
function hslEditor() {
  const modi = [tr('Farbton'), tr('Sättigung'), tr('Luminanz')]; const box = el('div');
  const tabs = el('div', { class: 'tabs' }, ...modi.map((m, i) => el('button', { class: S.hslModus === i ? 'an' : '', onclick: () => { S.hslModus = i; panel(); } }, m)));
  box.append(tabs);
  for (const f of E.HSL_FARBEN) {
    const ziel = () => ({ get v() { return S.edit.hsl[f.k][S.hslModus]; } });
    const r = regler(f.name, () => S.edit.hsl[f.k], S.hslModus, -100, 100, { grad: S.hslModus === 0 ? `linear-gradient(90deg,hsl(${f.hue - 30},80%,50%),hsl(${f.hue},80%,50%),hsl(${f.hue + 30},80%,50%))` : S.hslModus === 1 ? `linear-gradient(90deg,#777,${f.farbe})` : `linear-gradient(90deg,#000,${f.farbe},#fff)` });
    r.querySelector('label').prepend(el('span', { style: `width:9px;height:9px;border-radius:2px;background:${f.farbe};display:inline-block` })); void ziel;
    box.append(r);
  }
  box.append(el('button', { class: 'btn klein', onclick: () => aendern(e => { for (const f of E.HSL_FARBEN) e.hsl[f.k] = [0, 0, 0]; }, { neuPanel: true }) }, tr('Farbmischer zurücksetzen')));
  return box;
}

/* ───── Zuschnitt ───── */
function panelZuschnitt(p) {
  const g = S.edit.geo;
  const formate = el('div', { class: 'formate' }, ...VERHAELTNISSE.map(v => el('button', { class: 'btn klein' + (g.ratio === v.id ? ' an' : ''), title: v.tipp || '', onclick: () => verhaeltnis(v.id) }, v.name)));
  p.append(sektion('format', tr('Format'), [formate, el('div', { class: 'knopfreihe' },
    el('button', { class: 'btn klein', title: tr('Hoch-/Querformat tauschen'), onclick: () => { const v = VERHAELTNISSE.find(x => x.id === g.ratio); if (v?.r && v.r !== 'orig') { const umg = VERHAELTNISSE.find(x => x.r && x.r !== 'orig' && Math.abs(x.r - 1 / v.r) < 0.01); if (umg) verhaeltnis(umg.id); } } }, tr('⇄ Hoch/Quer')),
    el('button', { class: 'btn klein', onclick: () => aendern(e => { e.geo.crop = null; e.geo.ratio = 'frei'; }, { neuPanel: true }) }, tr('Zuschnitt aufheben')))], infoPunkt(tr('Format wählen, dann im Bild den Rahmen an den Ecken ziehen oder innen verschieben. 4:5 = Instagram, 16:9 = Webseite, 9:16 = Story, DIN = Ausdruck ohne Rand.'), 'zuschnitt')));
  p.append(sektion('drehen', tr('Drehen & Spiegeln'), [el('div', { class: 'knopfreihe' },
    el('button', { class: 'btn', title: tr('90° nach links'), onclick: () => aendern(e => { e.geo.rot = (e.geo.rot + 3) % 4; e.geo.crop = null; }, { neuPanel: true }) }, '⟲ 90°'),
    el('button', { class: 'btn', title: tr('90° nach rechts'), onclick: () => aendern(e => { e.geo.rot = (e.geo.rot + 1) % 4; e.geo.crop = null; }, { neuPanel: true }) }, '⟳ 90°'),
    el('button', { class: 'btn' + (g.flipH ? ' an' : ''), onclick: () => aendern(e => e.geo.flipH = !e.geo.flipH, { neuPanel: true }) }, tr('⇋ waagerecht')),
    el('button', { class: 'btn' + (g.flipV ? ' an' : ''), onclick: () => aendern(e => e.geo.flipV = !e.geo.flipV, { neuPanel: true }) }, tr('⇵ senkrecht')))]));
  p.append(sektion('gerade', tr('Gerade richten'), [
    regler(tr('Winkel °'), () => S.edit.geo, 'angle', -45, 45, { schritt: 0.1, info: tr('Dreht das Bild fein, z. B. schiefe Fliesenfugen oder Horizont. Das Bild wird automatisch so vergrößert, dass keine leeren Ecken entstehen.') }),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'btn gruen', title: tr('Findet senkrechte/waagerechte Kanten (Fugen, Türen, Wände) und richtet aus'), onclick: () => { const v = E.gl(); v.quelle(S.bmp, S.rec.id); const roh = v.geometrie({ ...S.edit.geo, angle: 0, crop: null }, 900, 900, true).canvas; const a = E.autoGerade(roh); aendern(e => e.geo.angle = a, { neuPanel: true }); toast(a ? tr('Um {0}° ausgerichtet', zahl(a)) : tr('Bild ist schon gerade')); } }, tr('✨ Auto ausrichten')),
      el('button', { class: 'btn' + (S.linieModus ? ' an' : ''), title: tr('Linie entlang einer Fuge/Kante ziehen, die waagerecht oder senkrecht sein soll'), onclick: () => { S.linieModus = !S.linieModus; panel(); toast(S.linieModus ? tr('Zieh im Bild eine Linie entlang einer Fuge oder Kante') : tr('Linien-Ausrichten aus')); } }, tr('📏 an Linie ausrichten')))]));
  p.append(sektion('persp', tr('Perspektive (stürzende Linien)'), [
    regler(tr('Senkrecht'), () => S.edit.geo.persp, 'v', -100, 100, { info: tr('Korrigiert stürzende Linien: Wände/Fliesen, die nach oben zusammenlaufen, wieder parallel stellen. Raster einschalten hilft.') }),
    regler(tr('Waagerecht'), () => S.edit.geo.persp, 'h', -100, 100, { info: tr('Gleicht seitlich schräg fotografierte Wände aus.') }),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!S.rasterFein, onchange: (e) => { S.rasterFein = e.target.checked; ueberZeichnen(); } }), tr('feines Raster einblenden'))], infoPunkt(tr('Ideal für Fliesen- und Raumfotos: Bild so ausrichten, dass Fugen und Kanten parallel zum Raster laufen.'), 'perspektive')));
  p.append(sektion('objektiv', tr('Objektivkorrektur'), [
    regler(tr('Verzeichnung'), () => S.edit.geo.lens, 'k', -100, 100, { info: tr('Gleicht gewölbte Linien aus. Nach rechts: Linien, die nach außen gebogen sind (Weitwinkel, Handy 0,5×, Fliesenfugen am Bildrand) werden wieder gerade. Nach links: nach innen gebogene Linien (Tele).') }),
    regler(tr('Farbsäume'), () => S.edit.geo.lens, 'ca', -100, 100, { info: tr('Entfernt rote/grüne bzw. blaue/gelbe Ränder an kontrastreichen Kanten (chromatische Aberration), z. B. an Fensterrahmen gegen hellen Himmel.') }),
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', title: tr('Typische Werte für Handy-Weitwinkel (0,5×)'), onclick: () => aendern(e => { e.geo.lens.k = 35; e.geo.lens.ca = 20; }, { neuPanel: true }) }, tr('Handy 0,5×')), el('button', { class: 'btn klein', onclick: () => aendern(e => { e.geo.lens.k = 12; e.geo.lens.ca = 10; }, { neuPanel: true }) }, tr('Handy normal')), el('button', { class: 'btn klein', onclick: () => aendern(e => { e.geo.lens = { k: 0, ca: 0 }; }, { neuPanel: true }) }, tr('Aus')))
  ], infoPunkt(tr('Objektivfehler korrigieren: gebogene Fugen und Kanten gerade ziehen und Farbsäume entfernen. Mit feinem Raster prüfen.'), 'objektiv')));
  p.append(el('div', { style: 'padding:12px' }, el('button', { class: 'btn primaer voll', onclick: () => wzWahl('anpassen') }, tr('✓ Fertig')), S.edit.heal.length ? el('p', { class: 'notiz' }, tr('Hinweis: Retusche-Punkte, Einzeichnungen und Text liegen relativ zum Ausschnitt – nach größeren Änderungen kurz prüfen.')) : null));
}
function verhaeltnis(id) {
  const v = VERHAELTNISSE.find(x => x.id === id); const [Wo, Ho] = E.orientiertGroesse(S.rec.w, S.rec.h, S.edit.geo.rot);
  aendern(e => {
    e.geo.ratio = id; if (!v.r) { if (!e.geo.crop) e.geo.crop = { x: 0, y: 0, w: 1, h: 1 }; return; }
    const r = v.r === 'orig' ? Wo / Ho : v.r; let w = 1, h = (Wo / r) / Ho; if (h > 1) { h = 1; w = (Ho * r) / Wo; }
    const c = e.geo.crop || { x: 0, y: 0, w: 1, h: 1 }; const cx = c.x + c.w / 2, cy = c.y + c.h / 2; const k = Math.min(1, c.w / w, c.h / h) || 1; w *= Math.max(k, 0.6); h *= Math.max(k, 0.6);
    e.geo.crop = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
  }, { neuPanel: true });
}
function cropZieh(start, griffIdx, nx, ny, shift) {
  const [Wo, Ho] = E.orientiertGroesse(S.rec.w, S.rec.h, S.edit.geo.rot); const v = VERHAELTNISSE.find(x => x.id === S.edit.geo.ratio);
  let r = v?.r === 'orig' ? Wo / Ho : v?.r || null; if (!r && shift) r = (start.w * Wo) / (start.h * Ho);
  let { x, y, w, h } = start; const dx = nx - S.zStart[0], dy = ny - S.zStart[1];
  if (griffIdx < 0) { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
  else {
    let l = x, t = y, rr = x + w, b = y + h; const gx = [0, 1, 2, 2, 2, 1, 0, 0][griffIdx], gy = [0, 0, 0, 1, 2, 2, 2, 1][griffIdx];
    if (gx === 0) l = clamp(l + dx, 0, rr - 0.02); if (gx === 2) rr = clamp(rr + dx, l + 0.02, 1); if (gy === 0) t = clamp(t + dy, 0, b - 0.02); if (gy === 2) b = clamp(b + dy, t + 0.02, 1);
    if (r) { // Seitenverhältnis halten
      let pw = (rr - l) * Wo, ph = (b - t) * Ho;
      if (gy === 1 || (gx !== 1 && pw / ph > r)) ph = pw / r; else pw = ph * r;
      let nw = pw / Wo, nh = ph / Ho; if (nw > 1) { nw = 1; nh = Wo / r / Ho; } if (nh > 1) { nh = 1; nw = Ho * r / Wo; }
      if (gx === 0) l = rr - nw; else if (gx === 2) rr = l + nw; else { const c = (l + rr) / 2; l = c - nw / 2; rr = c + nw / 2; }
      if (gy === 0) t = b - nh; else if (gy === 2) b = t + nh; else { const c = (t + b) / 2; t = c - nh / 2; b = c + nh / 2; }
      if (l < 0) { rr -= l; l = 0; } if (t < 0) { b -= t; t = 0; } if (rr > 1) { l -= rr - 1; rr = 1; } if (b > 1) { t -= b - 1; b = 1; }
    }
    x = l; y = t; w = rr - l; h = b - t;
  }
  S.edit.geo.crop = { x, y, w, h };
}

/* ───── Retusche ───── */
function panelRetusche(p) {
  p.append(sektion('ret', tr('Retusche'), [
    el('div', { class: 'tabs' }, el('button', { class: S.healArt === 'heal' ? 'an' : '', onclick: () => { S.healArt = 'heal'; panel(); } }, tr('✚ Reparieren')), el('button', { class: S.healArt === 'clone' ? 'an' : '', onclick: () => { S.healArt = 'clone'; panel(); } }, tr('⎘ Stempel'))),
    el('p', { class: 'hinweis' }, S.healArt === 'heal' ? tr('Auf Fleck, Staubkorn, Kabel oder Dübelloch klicken – die Stelle wird mit passender Umgebung aufgefüllt und farblich angeglichen.') : tr('Stempel: Mit Alt+Klick die Quelle wählen (gelbes Kreuz), dann auf die Zielstelle klicken. Kopiert 1:1.')),
    regler(tr('Pinselgröße'), () => S, 'healGroesse', 0.5, 15, { schritt: 0.1, null: 3 }),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!S.healAlleQuellen, onchange: (e) => { S.healAlleQuellen = e.target.checked; ueberZeichnen(); } }), tr('Quellen aller Punkte zeigen')),
    el('p', { class: 'hinweis' }, tr('{0} Punkt(e). Punkt anklicken = auswählen; gestrichelten Quellkreis ziehen = andere Quelle; Entf = löschen.', S.edit.heal.length)),
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', onclick: () => { if (S.healAuswahl) aendern(e => e.heal = e.heal.filter(o => o !== S.healAuswahl), { neuPanel: true }); } }, tr('Auswahl löschen')), el('button', { class: 'btn klein', onclick: () => aendern(e => e.heal = [], { neuPanel: true }) }, tr('Alle löschen')))
  ], infoPunkt(tr('Wie im Profi-Programm: „Reparieren“ gleicht Helligkeit und Farbe an, „Stempel“ kopiert genau.'), 'retusche')));
}
/* ───── Text ───── */
function panelText(p) {
  const t = S.auswahlText;
  const liste = el('div', { class: 'liste-ebenen' }, ...S.edit.text.map(tt => el('div', { class: 'ebene' + (tt === t ? ' an' : ''), onclick: () => { S.auswahlText = tt; panel(); ueberZeichnen(); } }, el('b', {}, 'T'), el('span', {}, tt.text || '(leer)'))));
  p.append(sektion('text', tr('Text-Ebenen'), [
    el('button', { class: 'btn primaer voll', onclick: () => textNeu(0.5, 0.5) }, tr('＋ Text hinzufügen')), liste,
    el('p', { class: 'hinweis' }, tr('Oder einfach ins Bild klicken. Text im Bild ziehen = verschieben.'))], infoPunkt(tr('Für Überschriften, Hinweise oder Firmeninfo direkt im Bild. Beim Export kommt zusätzlich ein Wasserzeichen dazu, wenn eingeschaltet.'), 'text')));
  if (!t) return;
  const set = (k, v, neu) => aendern(() => { t[k] = v; }, { neuPanel: !!neu });
  p.append(sektion('textprop', tr('Gewählter Text'), [
    el('textarea', { class: 'inp', rows: 3, style: 'width:100%', oninput: (e) => set('text', e.target.value) }, t.text),
    el('label', { class: 'lbl' }, tr('Schrift')), el('select', { class: 'inp', style: 'width:100%', onchange: async (e) => { await document.fonts.load(`40px "${e.target.value}"`).catch(() => { }); set('font', e.target.value); } }, ...E.SCHRIFTEN.map(f => el('option', { value: f, selected: t.font === f, style: `font-family:"${f}"` }, f))),
    regler(tr('Größe'), () => t, 'size', 1, 40, { schritt: 0.5, null: 6 }), regler(tr('Deckkraft'), () => t, 'opacity', 5, 100, { null: 100 }),
    el('label', { class: 'lbl' }, tr('Farbe')), el('div', { class: 'farbpalette' }, ...TEXT_FARBEN.map(f => el('button', { class: t.color === f ? 'an' : '', style: { background: f }, onclick: () => set('color', f, true) })), el('input', { type: 'color', value: t.color || '#ffffff', oninput: (e) => set('color', e.target.value) })),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'btn klein' + (t.bold ? ' an' : ''), onclick: () => set('bold', !t.bold, true) }, tr('Fett')), el('button', { class: 'btn klein' + (t.italic ? ' an' : ''), onclick: () => set('italic', !t.italic, true) }, tr('Kursiv')),
      ...[['left', tr('⯇ links')], ['center', 'mittig'], ['right', tr('rechts ⯈')]].map(([a, l]) => el('button', { class: 'btn klein' + ((t.align || 'center') === a ? ' an' : ''), onclick: () => set('align', a, true) }, l))),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!t.shadow, onchange: (e) => set('shadow', e.target.checked) }), tr('Schatten (lesbar auf hellem Grund)')),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!t.outline, onchange: (e) => set('outline', e.target.checked) }), tr('Kontur')),
    el('div', { class: 'zeile' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!t.box, onchange: (e) => set('box', e.target.checked) }), tr('Hintergrund-Feld')), el('input', { type: 'color', value: t.boxColorHex || '#000000', oninput: (e) => { const h = e.target.value; set('boxColorHex', h); set('boxColor', h + 'b0'); } })),
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', onclick: () => { const k = { ...t, id: uid(), y: Math.min(0.95, t.y + 0.08) }; aendern(e => e.text.push(k)); S.auswahlText = k; panel(); } }, tr('Duplizieren')),
      el('button', { class: 'btn klein', onclick: () => { aendern(e => e.text = e.text.filter(x => x !== t)); S.auswahlText = null; panel(); } }, tr('🗑 Löschen')))]));
}
function textNeu(x, y) {
  const t = { id: uid(), text: tr('Ihr Text'), x, y, size: 7, color: '#ffffff', font: 'Oswald', bold: true, shadow: true, align: 'center', opacity: 100 };
  aendern(e => e.text.push(t)); S.auswahlText = t; panel(); ueberZeichnen();
  setTimeout(() => { const ta = $('#edPanel textarea'); ta?.focus(); ta?.select(); }, 30);
}
/* ───── Einzeichnen ───── */
function panelMarkup(p) {
  const m = S.auswahlMarkup;
  p.append(sektion('mwz', tr('Einzeichnen & Markieren'), [
    el('div', { class: 'markup-wz' }, el('button', { class: 'btn klein' + (S.markupWz === 'zeiger' ? ' an' : ''), title: tr('Auswählen & verschieben'), onclick: () => { S.markupWz = 'zeiger'; panel(); } }, el('b', {}, '⬉'), tr('Auswählen')),
      ...MARKUP_WZ.map(w => el('button', { class: 'btn klein' + (S.markupWz === w.t ? ' an' : ''), title: w.tipp, onclick: () => { S.markupWz = w.t; S.auswahlMarkup = null; panel(); } }, el('b', {}, w.sym), w.name))),
    el('label', { class: 'lbl' }, tr('Farbe')), el('div', { class: 'farbpalette' }, ...MARKUP_FARBEN.map(f => el('button', { class: (m ? m.farbe : S.markupFarbe) === f ? 'an' : '', style: { background: f }, onclick: () => { S.markupFarbe = f; if (m) aendern(() => m.farbe = f); panel(); } }))),
    regler(tr('Strichstärke'), () => m || S, m ? 'staerke' : 'markupStaerke', 1, 12, { schritt: 0.5, null: 4 }),
    regler(tr('Füllung %'), () => m || S, m ? 'fuellung' : 'markupFuellung', 0, 100, { null: 0 }),
    el('p', { class: 'hinweis' }, (MARKUP_WZ.find(w => w.t === S.markupWz)?.tipp || tr('Element anklicken zum Auswählen, ziehen zum Verschieben, Entf zum Löschen.')))
  ], infoPunkt(tr('So machst du dem Bauherrn klare Vorschläge: Bereiche einrahmen, Flächen farbig markieren, Pfeile mit Text, nummerierte Punkte mit Erklärung. Danach „Vorschlagsblatt“ als PDF erzeugen.'), 'markup')));
  if (m) p.append(sektion('mprop', tr('Gewähltes Element'), [
    ['nummer', 'notiz', 'masz', 'pfeil', 'rechteck', 'ellipse', 'wolke', 'flaeche'].includes(m.t) ? el('div', {}, el('label', { class: 'lbl' }, m.t === 'nummer' ? tr('Erklärung zu Punkt {0} (erscheint in der Legende)', m.nr) : m.t === 'masz' ? tr('Maß-Beschriftung (z. B. 1,20 m)') : tr('Beschriftung')),
      el('textarea', { class: 'inp', rows: 2, style: 'width:100%', oninput: (e) => aendern(() => m.text = e.target.value) }, m.text || '')) : null,
    m.t === 'nummer' ? el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, tr('Nummer')), el('input', { type: 'number', class: 'inp', min: 1, value: m.nr, style: 'width:70px', onchange: (e) => aendern(() => m.nr = +e.target.value) })) : null,
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn klein', onclick: () => { aendern(e => e.markup = e.markup.filter(x => x !== m)); S.auswahlMarkup = null; panel(); } }, tr('🗑 Löschen')),
      el('button', { class: 'btn klein', onclick: () => { const k = JSON.parse(JSON.stringify(m)); k.pts = k.pts.map(([a, b]) => [Math.min(0.98, a + 0.03), Math.min(0.98, b + 0.03)]); if (k.t === 'nummer') k.nr = naechsteNummer(S.edit.markup); aendern(e => e.markup.push(k)); S.auswahlMarkup = k; panel(); } }, tr('Duplizieren')),
      el('button', { class: 'btn klein', title: tr('nach vorne'), onclick: () => aendern(e => { e.markup = e.markup.filter(x => x !== m); e.markup.push(m); }) }, tr('⇡ nach vorn')))]));
  const L = legende(S.edit.markup);
  p.append(sektion('legende', tr('Legende ({0})', L.length), [
    L.length ? el('div', {}, ...L.map(l => el('div', { class: 'ebene', onclick: () => { S.auswahlMarkup = S.edit.markup.find(x => x.t === 'nummer' && x.nr === l.nr); panel(); zeichnen(); } }, el('b', { style: { color: l.farbe } }, l.nr + '.'), el('span', {}, l.text || tr('– Erklärung fehlt –'))))) : el('p', { class: 'hinweis' }, tr('Setze nummerierte Punkte (①) – ihre Erklärungen erscheinen hier und auf dem Vorschlagsblatt.')),
    el('button', { class: 'btn primaer voll', style: 'margin-top:8px', onclick: async () => { await speichern(); window.BS.vorschlag(S.rec.id); } }, FREI ? tr('📄 Vorschlagsblatt (PDF + Word)') : tr('📄 Vorschlagsblatt für Bauherrn (PDF)')),
    el('button', { class: 'btn voll', style: 'margin-top:6px', onclick: () => aendern(e => e.markup = [], { neuPanel: true }) }, tr('Alle Einzeichnungen löschen'))]));
}

/* ───── Bild-Check & Ein-Klick-Verbesserung ───── */
function checkSektion() {
  const box = el('div', { class: 'check-liste' }, el('p', { class: 'hinweis' }, tr('Bild wird geprüft …')));
  const knopf = el('button', { class: 'btn gruen voll gross', title: tr('Prüft Schärfe, Rauschen, Licht, Farbe und Ausrichtung und verbessert alles in einem Schritt. Danach mit den Reglern feinjustieren – oder Strg+Z.'), onclick: allesVerbessern }, tr('✨ Alles automatisch verbessern'));
  const optionen = el('div', { class: 'zeile', style: 'gap:12px;flex-wrap:wrap' },
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: state.einst.autoGerade !== false, onchange: (e) => { state.einst.autoGerade = e.target.checked; einstSpeichern(); } }), tr('auch gerade richten')),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: state.einst.autoRetten !== false, onchange: (e) => { state.einst.autoRetten = e.target.checked; einstSpeichern(); } }), tr('Unschärfe retten')));
  const sek = sektion('check', tr('Bild-Check & Auto'), [box, knopf, optionen], infoPunkt(tr('Der Bild-Check misst wie ein Profi-Programm: Ist das Foto scharf oder verwackelt? Verrauscht? Zu dunkel, flau, farbstichig oder schief? Grün = gut, Gelb = verbesserbar, Rot = sollte korrigiert werden. „Alles automatisch verbessern“ korrigiert alles auf einmal.'), 'bild-check'));
  setTimeout(() => checkZeigen(box), 40);
  return sek;
}
function checkErgebnis() {
  // geprüft wird das aktuelle Ergebnis (mit Licht, Farbe, Schärfen) – so sieht man, ob die Korrektur gewirkt hat
  const key = healKey() + JSON.stringify([S.edit.adj, S.edit.curves, S.edit.hsl, S.edit.geo]); if (S.cache.check?.key === key) return S.cache.check.erg;
  const out = sicherGL().farbe(S.edit), k = Math.min(1, 1000 / Math.max(out.width, out.height)), c = document.createElement('canvas'); c.width = Math.round(out.width * k); c.height = Math.round(out.height * k); c.getContext('2d').drawImage(out, 0, 0, c.width, c.height);
  const erg = bildCheck(c, { rettungAktiv: S.edit.deblur?.art && S.edit.deblur.art !== 'aus' }); S.cache.check = { key, erg }; return erg;
}
const checkBald = debounce(() => { const b = document.querySelector('.check-liste'); if (b && S) checkZeigen(b); }, 700);
function checkZeigen(box) {
  if (!S || !box.isConnected) return; if (!S.cache.roh || S.cache.healKey !== healKey()) { setTimeout(() => checkZeigen(box), 250); return; }
  let erg; try { erg = checkErgebnis(); } catch (err) { box.innerHTML = ''; box.append(el('p', { class: 'hinweis' }, tr('Bild-Check nicht möglich: ') + err.message)); return; }
  box.innerHTML = '';
  for (const p of erg.punkte) box.append(el('div', { class: 'check ' + p.stufe, title: p.tipp }, el('i'), el('b', {}, p.titel), el('span', {}, p.wert), p.stufe !== 'gruen' ? el('small', {}, p.tipp) : null));
}
function allesVerbessern() {
  if (!S.cache.roh) return; const geo = S.cache.geo;
  const { aend, check } = autoVerbessern(S.cache.roh, { geraderichten: state.einst.autoGerade !== false, retten: state.einst.autoRetten !== false, skala: geo.w / (geo.cw || geo.w) });
  const text = [];
  aendern(e => {
    Object.assign(e.adj, aend.adj); text.push(tr('Licht & Farbe'));
    if (aend.adj.noise) text.push(tr('Rauschen −') + aend.adj.noise); if (aend.adj.sharpen) text.push(tr('Schärfen ') + aend.adj.sharpen);
    if (aend.deblur) { e.deblur = { ...e.deblur, ...aend.deblur }; text.push(aend.deblur.art === 'bewegung' ? tr('Verwacklung zurückgerechnet') : tr('Unschärfe zurückgerechnet')); }
    if (aend.angle != null) { e.geo.angle = clamp(Math.round((e.geo.angle + aend.angle) * 10) / 10, -45, 45); text.push(tr('um {0}° gerade gerichtet', zahl(aend.angle))); }
  }, { neuPanel: true });
  void check; toast(tr('✨ Verbessert: ') + text.join(' · ') + tr(' – Strg+Z macht es rückgängig'), 'ok', 5200);
}
/* ───── Unschärfe-Rettung (Richardson-Lucy-Entfaltung) ───── */
function rettungSektion() {
  const d = S.edit.deblur, art = d.art || 'aus', db = () => S.edit.deblur;
  const tabs = el('div', { class: 'tabs' }, ...[['aus', tr('Aus')], ['fokus', tr('Fokus-Unschärfe')], ['bewegung', tr('Verwacklung')]].map(([k, t]) => el('button', { class: art === k ? 'an' : '', onclick: () => aendern(e => { e.deblur.art = k; }, { neuPanel: true }) }, t)));
  const inhalt = [tabs];
  if (art === 'fokus') inhalt.push(regler(tr('Radius (px)'), db, 'radius', 0.4, 8, { schritt: 0.1, null: 1.5, info: tr('Wie stark das Bild verschwommen ist. Langsam erhöhen, bis Kanten scharf werden. Zu viel erzeugt Doppelkanten/Ringe.') }));
  if (art === 'bewegung') inhalt.push(regler(tr('Länge (px)'), db, 'laenge', 2, 60, { null: 12, info: tr('Wie weit die Kamera beim Auslösen gewackelt hat (Länge der Schlieren).') }), regler(tr('Richtung °'), db, 'winkel', 0, 179, { null: 0, info: tr('0° = waagerecht verwackelt, 90° = senkrecht. Am besten „Automatisch erkennen“ nutzen.') }));
  if (art !== 'aus') inhalt.push(regler(tr('Stärke'), db, 'staerke', 0, 100, { null: 60, info: tr('Wie kräftig zurückgerechnet wird. Bei stark verrauschten Bildern lieber weniger und zusätzlich „Rauschen reduzieren“.') }));
  inhalt.push(el('div', { class: 'knopfreihe' },
    el('button', { class: 'btn gruen', title: tr('Misst, ob das Bild unscharf oder verwackelt ist, und stellt die Rettung passend ein'), onclick: () => { const { aend } = autoVerbessern(S.cache.roh, { geraderichten: false, retten: true, skala: skala() }); if (!aend.deblur) { toast(tr('Das Bild ist ausreichend scharf – leichtes Schärfen genügt.')); return; } aendern(e => { e.deblur = { ...e.deblur, ...aend.deblur }; }, { neuPanel: true }); toast(aend.deblur.art === 'bewegung' ? tr('Verwacklung erkannt ({0} px, {1}°)', aend.deblur.laenge, aend.deblur.winkel) : tr('Fokus-Unschärfe erkannt (Radius {0} px)', zahl(aend.deblur.radius))); } }, tr('🔍 Automatisch erkennen')),
    FREI ? null : el('button', { class: 'btn', title: tr('Noch mehr Schärfe mit künstlicher Intelligenz'), onclick: () => wzWahl('ki') }, tr('✦ KI-Schärfen …'))));
  inhalt.push(el('p', { class: 'hinweis' }, art === 'aus' ? tr('Für unscharfe oder verwackelte Fotos: rechnet die Unschärfe mathematisch zurück (wie „Shake Reduction“ in Photoshop). Wunder sind nicht möglich, aber Schrift, Fugen und Kanten werden deutlich klarer.') : tr('Rechenintensiv: Die Vorschau aktualisiert sich kurz nach dem Loslassen des Reglers.') + (S.cache.deblurMs ? ` (${Math.round(S.cache.deblurMs)} ms)` : '')));
  return sektion('rettung', tr('Unschärfe-Rettung'), inhalt, infoPunkt(tr('Fokus-Unschärfe: Kamera hat danebengestellt, alles ist gleichmäßig weich. Verwacklung: Schlieren in eine Richtung. „Automatisch erkennen“ misst beides und stellt die Werte ein.'), 'unschaerfe'));
}

/* ───── Masken: lokale Anpassungen ───── */
const MASKE_ADJ = [['exposure', tr('Belichtung')], ['contrast', tr('Kontrast')], ['highlights', tr('Lichter')], ['shadows', tr('Tiefen')], ['temp', tr('Temperatur')], ['tint', tr('Tönung')], ['saturation', tr('Sättigung')], ['clarity', tr('Klarheit')], ['dehaze', tr('Dunst entfernen')], ['sharpen', tr('Schärfen')], ['noise', tr('Rauschen reduzieren')]];
const MASKE_NAMEN = { verlauf: tr('Verlauf'), radial: tr('Radial'), pinsel: tr('Pinsel'), himmel: tr('Himmel') };
const MASKE_VORLAGEN = [
  [tr('Aufhellen'), { exposure: 35, shadows: 30 }], [tr('Abdunkeln'), { exposure: -35, highlights: -20 }], [tr('Himmel kräftiger'), { exposure: -25, highlights: -40, saturation: 25, dehaze: 25, temp: -10 }],
  [tr('Wärmer'), { temp: 30 }], [tr('Kühler'), { temp: -30 }], [tr('Details betonen'), { clarity: 40, sharpen: 40, contrast: 10 }], [tr('Weichzeichnen'), { clarity: -60, noise: 50 }], [tr('Farbe raus'), { saturation: -100 }]];
const maske = () => S.edit.masken[S.maskeIdx];
function maskeNeu(typ) {
  if (S.edit.masken.length >= 8) { toast(tr('Maximal 8 Masken pro Bild'), 'warn'); return; }
  let m = { id: uid(), typ, adj: {}, invert: false };
  if (typ === 'verlauf') Object.assign(m, { a: [0.5, 0.0], b: [0.5, 0.45] });
  if (typ === 'radial') { const cv = $('#edBild'), asp = cv ? cv.width / cv.height : 1.5; Object.assign(m, { c: [0.5, 0.5], r: [0.28, 0.28 * asp], winkel: 0, weich: 60 }); }
  if (typ === 'pinsel') m.striche = [];
  if (typ === 'himmel') { const h = himmelMaske(S.cache.roh || S.cache.heal); const anteil = h.a.reduce((s, v) => s + v, 0) / 255 / h.a.length; if (anteil < 0.02) { toast(tr('Kein Himmel erkannt – male den Bereich mit einer Pinsel-Maske.'), 'warn', 4200); return; } Object.assign(m, { himmel: h, striche: [] }); m.adj = { ...MASKE_VORLAGEN[2][1] }; }
  aendern(e => e.masken.push(m)); S.maskeIdx = S.edit.masken.length - 1; S.maskeZeigen = typ !== 'himmel'; panel();
  toast({ verlauf: tr('Verlauf: im Bild ziehen (von „voll“ nach „aus“) oder die Punkte verschieben'), radial: tr('Radial: im Bild aufziehen oder Mitte/Ränder verschieben'), pinsel: tr('Pinsel: Bereich im Bild übermalen (Alt = radieren)'), himmel: tr('Himmel erkannt – Regler einstellen. Mit dem Pinsel kannst du ergänzen oder radieren.') }[typ], 'ok', 4200);
}
function panelMasken(p) {
  const m = maske();
  const neu = el('div', { class: 'knopfreihe' },
    el('button', { class: 'btn', title: tr('Linearer Verlauf – z. B. Himmel abdunkeln, Boden aufhellen'), onclick: () => maskeNeu('verlauf') }, tr('▤ Verlauf')),
    el('button', { class: 'btn', title: tr('Kreis/Ellipse – z. B. Motiv hervorheben, Ränder abdunkeln'), onclick: () => maskeNeu('radial') }, tr('◎ Radial')),
    el('button', { class: 'btn', title: tr('Frei mit dem Pinsel malen – z. B. eine Wand, eine Fuge, ein Gesicht'), onclick: () => maskeNeu('pinsel') }, tr('🖌 Pinsel')),
    el('button', { class: 'btn', title: tr('Himmel automatisch erkennen'), onclick: () => maskeNeu('himmel') }, tr('☁ Himmel')));
  const liste = el('div', { class: 'liste-ebenen' }, ...S.edit.masken.map((mm, i) => el('div', { class: 'ebene' + (i === S.maskeIdx ? ' an' : ''), onclick: () => { S.maskeIdx = i; panel(); } }, el('b', {}, String(i + 1)), el('span', {}, MASKE_NAMEN[mm.typ] + (mm.invert ? tr(' (umgekehrt)') : '') + ' · ' + (Object.entries(mm.adj || {}).filter(([, v]) => v).map(([k]) => (MASKE_ADJ.find(a => a[0] === k) || [, k])[1]).join(', ') || tr('noch keine Regler'))))));
  p.append(sektion('masken', tr('Masken – nur einen Bereich ändern'), [neu, S.edit.masken.length ? liste : el('p', { class: 'hinweis' }, tr('Wie in Lightroom: Erst einen Bereich wählen (Verlauf, Radial, Pinsel oder Himmel), dann mit den Reglern nur diesen Bereich verändern – z. B. ausgefressenen Himmel abdunkeln, eine dunkle Ecke aufhellen, die Fliesenwand schärfen.')),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!S.maskeZeigen, onchange: (e) => { S.maskeZeigen = e.target.checked; zeichnen(); } }), tr('Maske rot anzeigen (Taste O)'))], infoPunkt(tr('Masken = lokale Anpassungen. Bis zu 8 pro Bild. Jede Maske hat eigene Regler. „Umkehren“ wirkt auf alles außer dem Bereich.'), 'masken')));
  if (!m) return;
  const werkzeug = [];
  if (m.typ === 'pinsel' || m.typ === 'himmel') {
    S.pinsel ||= { groesse: 6, haerte: 50, fluss: 100, radieren: false };
    werkzeug.push(el('div', { class: 'tabs' }, el('button', { class: !S.pinsel.radieren ? 'an' : '', onclick: () => { S.pinsel.radieren = false; panel(); } }, tr('🖌 Malen')), el('button', { class: S.pinsel.radieren ? 'an' : '', onclick: () => { S.pinsel.radieren = true; panel(); } }, tr('⌫ Radieren (Alt)'))),
      regler(tr('Pinselgröße'), () => S.pinsel, 'groesse', 0.5, 30, { schritt: 0.5, null: 6 }), regler(tr('Weiche Kante'), () => S.pinsel, 'haerte', 0, 100, { null: 50, info: tr('0 = sehr weich auslaufend, 100 = harte Kante') }), regler(tr('Deckkraft'), () => S.pinsel, 'fluss', 5, 100, { null: 100 }),
      el('button', { class: 'btn klein', onclick: () => aendern(e => { e.masken[S.maskeIdx].striche = []; }, { neuPanel: true }) }, tr('Pinselstriche löschen')));
  }
  if (m.typ === 'radial') werkzeug.push(regler(tr('Weiche Kante'), () => maske(), 'weich', 0, 100, { null: 60 }), regler(tr('Drehung °'), () => maske(), 'winkel', -90, 90, { null: 0 }));
  if (m.typ === 'verlauf') werkzeug.push(el('p', { class: 'hinweis' }, tr('Im Bild ziehen: am Startpunkt wirkt die Maske voll, am Endpunkt läuft sie aus. Punkte und Linie lassen sich verschieben.')));
  werkzeug.push(el('div', { class: 'knopfreihe' },
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!m.invert, onchange: (e) => aendern(ed => { ed.masken[S.maskeIdx].invert = e.target.checked; }, { neuPanel: true }) }), tr('Umkehren')),
    el('button', { class: 'btn klein', onclick: () => { const k = JSON.parse(JSON.stringify(m)); k.id = uid(); aendern(e => e.masken.push(k)); S.maskeIdx = S.edit.masken.length - 1; panel(); } }, tr('Duplizieren')),
    el('button', { class: 'btn klein', onclick: () => { const i = S.maskeIdx; aendern(e => e.masken.splice(i, 1)); S.maskeIdx = S.edit.masken.length ? Math.min(i, S.edit.masken.length - 1) : null; panel(); } }, tr('🗑 Löschen'))));
  p.append(sektion('maske', tr('Maske {0}: {1}', S.maskeIdx + 1, MASKE_NAMEN[m.typ]), werkzeug));
  m.adj ||= {};
  p.append(sektion('maskeAdj', tr('Regler für diesen Bereich'), [
    el('div', { class: 'knopfreihe' }, ...MASKE_VORLAGEN.map(([n, w]) => el('button', { class: 'btn klein', onclick: () => aendern(e => { e.masken[S.maskeIdx].adj = { ...w }; }, { neuPanel: true }) }, n))),
    ...MASKE_ADJ.map(([k, t]) => regler(t, () => maske().adj, k, k === 'sharpen' || k === 'noise' ? 0 : -100, 100, { grad: k === 'temp' ? 'linear-gradient(90deg,#3b6fd8,#ddd,#e0b030)' : k === 'tint' ? 'linear-gradient(90deg,#3c9a3c,#ddd,#c040c0)' : null })),
    el('button', { class: 'btn klein', onclick: () => aendern(e => { e.masken[S.maskeIdx].adj = {}; }, { neuPanel: true }) }, tr('Regler zurücksetzen'))]));
}
function maskenUeber(x, W, H) {
  const m = maske(); if (!m) return;
  const P = (a) => nachSchirm(a[0], a[1]);
  x.lineWidth = 1.5;
  if (m.typ === 'verlauf') {
    const a = P(m.a), b = P(m.b), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 4000, ny = dx / L * 4000;
    x.setLineDash([6, 5]); x.strokeStyle = 'rgba(255,255,255,.85)';
    for (const q of [a, b]) { x.beginPath(); x.moveTo(q[0] - nx, q[1] - ny); x.lineTo(q[0] + nx, q[1] + ny); x.stroke(); }
    x.setLineDash([]); x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke();
    for (const [q, f] of [[a, '#facc15'], [b, '#fff']]) { x.fillStyle = f; x.strokeStyle = '#000'; x.beginPath(); x.arc(q[0], q[1], 7, 0, Math.PI * 2); x.fill(); x.stroke(); }
  }
  if (m.typ === 'radial') {
    const c = P(m.c), rx = m.r[0] * W, ry = m.r[1] * H, w = (m.winkel || 0) * Math.PI / 180, k = 1 - (m.weich ?? 60) / 100 * 0.9;
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(c[0], c[1], rx, ry, w, 0, Math.PI * 2); x.stroke();
    x.setLineDash([4, 4]); x.beginPath(); x.ellipse(c[0], c[1], rx * k, ry * k, w, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    for (const q of radialGriffe(m, W, H)) { x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.beginPath(); x.arc(q[0], q[1], 6, 0, Math.PI * 2); x.fill(); x.stroke(); }
    x.fillStyle = '#facc15'; x.beginPath(); x.arc(c[0], c[1], 6, 0, Math.PI * 2); x.fill(); x.stroke();
  }
  if ((m.typ === 'pinsel' || m.typ === 'himmel') && S.maus && S.pinsel) {
    const r = S.pinsel.groesse / 100 * Math.min(W, H); x.strokeStyle = S.pinsel.radieren || S.altGedrueckt ? '#ff8080' : '#fff'; x.beginPath(); x.arc(S.maus[0], S.maus[1], r, 0, Math.PI * 2); x.stroke();
    x.setLineDash([3, 3]); x.beginPath(); x.arc(S.maus[0], S.maus[1], r * Math.max(0.05, S.pinsel.haerte / 100), 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  }
}
function radialGriffe(m, W, H) { const c = nachSchirm(m.c[0], m.c[1]), w = (m.winkel || 0) * Math.PI / 180, rx = m.r[0] * W, ry = m.r[1] * H; return [[c[0] + Math.cos(w) * rx, c[1] + Math.sin(w) * rx], [c[0] - Math.sin(w) * ry, c[1] + Math.cos(w) * ry]]; }
/** Maus gedrückt im Masken-Werkzeug → Rückgabe: Zieh-Modus oder null */
function maskeDown(e, nx, ny) {
  const m = maske(); if (!m) { toast(tr('Erst rechts eine Maske anlegen (Verlauf, Radial, Pinsel oder Himmel)')); return null; }
  const cv = $('#edBild'), W = cv.width * S.z, H = cv.height * S.z, r = $('#buehne').getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, nah = (q, d = 12) => Math.hypot(q[0] - mx, q[1] - my) < d;
  vorAenderung();
  if (m.typ === 'verlauf') {
    if (nah(nachSchirm(...m.a))) return { art: 'va' }; if (nah(nachSchirm(...m.b))) return { art: 'vb' };
    const a = nachSchirm(...m.a), b = nachSchirm(...m.b), L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2, t = clamp(((mx - a[0]) * (b[0] - a[0]) + (my - a[1]) * (b[1] - a[1])) / (L2 || 1), 0, 1);
    if (Math.hypot(a[0] + t * (b[0] - a[0]) - mx, a[1] + t * (b[1] - a[1]) - my) < 8) return { art: 'vmove', a: m.a.slice(), b: m.b.slice(), s: [nx, ny] };
    m.a = [nx, ny]; m.b = [nx, ny]; return { art: 'vb' };
  }
  if (m.typ === 'radial') {
    const [g1, g2] = radialGriffe(m, W, H); if (nah(g1)) return { art: 'rx' }; if (nah(g2)) return { art: 'ry' };
    if (nah(nachSchirm(...m.c), 14)) return { art: 'rmove', c: m.c.slice(), s: [nx, ny] };
    const w = (m.winkel || 0) * Math.PI / 180, dx = (nx - m.c[0]) * W, dy = (ny - m.c[1]) * H, lx = dx * Math.cos(w) + dy * Math.sin(w), ly = -dx * Math.sin(w) + dy * Math.cos(w);
    if ((lx / (m.r[0] * W)) ** 2 + (ly / (m.r[1] * H)) ** 2 < 1) return { art: 'rmove', c: m.c.slice(), s: [nx, ny] };
    m.c = [nx, ny]; m.r = [0.01, 0.01]; return { art: 'raufziehen' };
  }
  if (m.typ === 'pinsel' || m.typ === 'himmel') {
    const st = { groesse: S.pinsel.groesse, haerte: S.pinsel.haerte, fluss: S.pinsel.fluss / 100, radieren: S.pinsel.radieren || e.altKey, pts: [[nx, ny]] };
    (m.striche ||= []).push(st); S.geaendert = true; zeichnenBald(); return { art: 'malen', st };
  }
  return null;
}
function maskeMove(z, nx, ny) {
  const m = maske(); if (!m) return; const cv = $('#edBild'), W = cv.width, H = cv.height;
  if (z.art === 'va') m.a = [nx, ny]; else if (z.art === 'vb') m.b = [nx, ny];
  else if (z.art === 'vmove') { const dx = nx - z.s[0], dy = ny - z.s[1]; m.a = [z.a[0] + dx, z.a[1] + dy]; m.b = [z.b[0] + dx, z.b[1] + dy]; }
  else if (z.art === 'rmove') m.c = [z.c[0] + nx - z.s[0], z.c[1] + ny - z.s[1]];
  else if (z.art === 'rx' || z.art === 'ry' || z.art === 'raufziehen') {
    const w = (m.winkel || 0) * Math.PI / 180, dx = (nx - m.c[0]) * W, dy = (ny - m.c[1]) * H, lx = Math.abs(dx * Math.cos(w) + dy * Math.sin(w)), ly = Math.abs(-dx * Math.sin(w) + dy * Math.cos(w));
    if (z.art !== 'ry') m.r[0] = Math.max(0.01, (z.art === 'raufziehen' ? Math.max(lx, 4) : Math.hypot(dx, dy)) / W);
    if (z.art !== 'rx') m.r[1] = Math.max(0.01, (z.art === 'raufziehen' ? Math.max(ly, 4) : Math.hypot(dx, dy)) / H);
  } else if (z.art === 'malen') { const l = z.st.pts[z.st.pts.length - 1]; if (Math.hypot((nx - l[0]) * W, (ny - l[1]) * H) > 2) z.st.pts.push([nx, ny]); }
  S.geaendert = true; zeichnenBald();
}

/* ───── KI-Werkstatt ───── */
function panelKI(p) {
  S.kiPinsel ||= 4; S.kiStriche ||= [];
  const lokal = el('div', { class: 'ki-karten' },
    ...KIB.LOKAL.map(a => el('button', { class: 'ki-karte', title: a.h, onclick: () => kiLokal(a) }, el('b', {}, a.i + ' ' + a.t), el('small', {}, a.h))));
  p.append(sektion('kiLokal', tr('KI auf diesem PC (kostenlos)'), [lokal, el('p', { class: 'hinweis' }, tr('Läuft direkt im Browser mit einem kleinen KI-Modell (ESRGAN). Beim ersten Mal wird es einmalig geladen (≈ 3 MB). Nichts verlässt den PC.'))], infoPunkt(tr('Hochrechnen vergrößert kleine oder ausgeschnittene Bilder mit künstlicher Intelligenz – feine Strukturen wie Fugen und Kanten werden neu erzeugt statt nur verpixelt vergrößert. „KI-Schärfen“ nutzt dasselbe Modell, um weiche Fotos klarer zu machen.'), 'ki-hochrechnen')));
  const auftrag = el('textarea', { class: 'inp', rows: 3, style: 'width:100%', placeholder: tr('Eigener Auftrag, z. B. „Entferne den Eimer und das Kabel vorne links“ oder „Mach die Fugen grau statt weiß“') }, S.kiAuftrag || '');
  auftrag.addEventListener('input', () => S.kiAuftrag = auftrag.value);
  const google = el('div', { class: 'ki-karten' }, ...KIB.GOOGLE.map(a => el('button', { class: 'ki-karte' + (a.markieren ? ' mark' : ''), title: a.h, onclick: () => kiGoogle(a) }, el('b', {}, a.i + ' ' + a.t), el('small', {}, a.h))));
  p.append(sektion('kiGoogle', tr('Google-KI (Gemini) – Bild verändern'), [
    google,
    el('label', { class: 'lbl' }, tr('Bereich markieren (für „Objekt entfernen“ und eigene Aufträge)')),
    el('div', { class: 'knopfreihe' }, el('button', { class: 'btn' + (S.kiMalen ? ' an' : ''), onclick: () => { S.kiMalen = !S.kiMalen; $('#buehne').style.cursor = S.kiMalen ? 'none' : 'default'; panel(); } }, S.kiMalen ? tr('🖌 Markieren an') : tr('🖌 Rot markieren')), el('button', { class: 'btn klein', onclick: () => { S.kiStriche = []; ueberZeichnen(); panel(); } }, tr('Markierung löschen')), el('span', { class: 'hinweis' }, S.kiStriche.length ? tr('{0} Markierung(en)', S.kiStriche.length) : '')),
    S.kiMalen ? regler(tr('Pinselgröße'), () => S, 'kiPinsel', 0.5, 15, { schritt: 0.5, null: 4 }) : null,
    el('label', { class: 'lbl' }, tr('Eigener Auftrag an die KI')), auftrag,
    el('div', { class: 'knopfreihe' },
      KIB.sprachOk() ? el('button', { class: 'btn', title: tr('Auftrag diktieren'), onclick: (e) => { const b = e.currentTarget; if (S.kiDiktat) { S.kiDiktat.stop(); return; } b.textContent = tr('⏺ Ich höre zu … (nochmal tippen = fertig)'); S.kiDiktat = KIB.diktat({ start: auftrag.value, onText: (t) => { auftrag.value = t; S.kiAuftrag = t; }, onEnde: () => { S.kiDiktat = null; b.textContent = tr('🎤 Diktieren'); } }); } }, tr('🎤 Diktieren')) : null,
      el('button', { class: 'btn primaer', onclick: () => { if (!auftrag.value.trim()) { toast(tr('Bitte erst einen Auftrag eintippen oder diktieren'), 'warn'); return; } kiGoogle({ k: 'frei', t: tr('Eigener Auftrag'), prompt: auftrag.value.trim() }); } }, tr('✦ Auftrag ausführen'))),
    el('p', { class: 'notiz' }, tr('⚠ KI-Bilder sind verändert und als „KI“ gekennzeichnet. Nicht als Beweis- oder Mängelfoto verwenden – dafür immer das Original nehmen.')),
    el('div', { class: 'zeile' }, el('span', { class: 'hinweis' }, KIB.geminiBereit() ? tr('✓ Google-KI verbunden (Schlüssel der Master-App)') : tr('Noch kein Google-KI-Schlüssel')), el('button', { class: 'btn klein', onclick: async () => { if (await KIB.schluesselDialog()) panel(); } }, tr('Schlüssel …')))
  ], infoPunkt(tr('Die Google-KI (Gemini „Nano Banana“) verändert Bilder nach deinem Wunsch: Gegenstände entfernen, Baustelle aufräumen, Licht verbessern, Hintergrund tauschen, Bild erweitern. Das Bild wird dazu an Google gesendet. Das Ergebnis kommt als neues Bild mit „KI“-Kennzeichnung – das Original bleibt unverändert.'), 'ki-werkstatt')));
}
/** aktuelles Bild in voller Qualität (mit allen Bearbeitungen, ohne Text/Einzeichnungen) */
async function kiQuelle(maxSeite) { await speichern(); return E.rendern(S.bmp, S.rec.id + ':ki', S.edit, { maxW: maxSeite, maxH: maxSeite, ebenen: false }); }
async function kiLokal(a) {
  const quelle = await kiQuelle(a.maxSeite || 1600);
  const erg = await KIB.lokalAusfuehren(a, quelle); if (!erg) return; S.cache.besitzer = null;
  await KIB.ergebnis({ rec: S.rec, vorher: quelle, nachher: erg, art: a.t, modell: tr('ESRGAN (lokal)') });
}
async function kiGoogle(a) {
  if (a.markieren && !S.kiStriche.length) { S.kiMalen = true; $('#buehne').style.cursor = 'none'; panel(); toast(tr('Erst den Bereich rot übermalen, dann nochmal „{0}“ tippen', a.t), 'warn', 4500); return; }
  const quelle = await kiQuelle(2048); let maske = null;
  if (S.kiStriche.length) { maske = document.createElement('canvas'); maske.width = quelle.width; maske.height = quelle.height; const x = maske.getContext('2d'); x.drawImage(quelle, 0, 0); x.globalAlpha = 0.6; x.strokeStyle = '#ff0000'; x.lineCap = x.lineJoin = 'round'; for (const st of S.kiStriche) { x.lineWidth = st.r * 2 * Math.min(quelle.width, quelle.height); x.beginPath(); st.pts.forEach(([u, v], i) => i ? x.lineTo(u * quelle.width, v * quelle.height) : x.moveTo(u * quelle.width, v * quelle.height)); if (st.pts.length === 1) x.lineTo(st.pts[0][0] * quelle.width + 0.5, st.pts[0][1] * quelle.height); x.stroke(); } }
  const erg = await KIB.googleAusfuehren(a, quelle, maske, S.kiAuftrag); S.cache.besitzer = null; if (!erg) return;
  const gespeichert = await KIB.ergebnis({ rec: S.rec, vorher: quelle, nachher: erg.canvas, art: a.t, modell: erg.modell, auftrag: erg.prompt });
  if (gespeichert) { S.kiStriche = []; S.kiMalen = false; }
}

/* ═════════ Maus & Touch auf der Bühne ═════════ */
function buehneEreignisse() {
  const b = $('#buehne'); let modus = null, start = null, ziel = null;
  new ResizeObserver(() => S && transform()).observe(b);
  b.addEventListener('wheel', (e) => { e.preventDefault(); const r = b.getBoundingClientRect(); const f = Math.exp(-e.deltaY * 0.0015); zoomAuf((S.z || 1) * f, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  b.addEventListener('pointermove', (e) => {
    const r = b.getBoundingClientRect(); S.maus = [e.clientX - r.left, e.clientY - r.top];
    if (!modus) { if (S.wz === 'masken' || (S.wz === 'ki' && S.kiMalen)) ueberZeichnen(); if (S.wz === 'retusche' || S.pipette || (S.wz === 'markup' && S.zeichnet?.t === 'flaeche')) ueberZeichnen(); if (S.wz === 'zuschnitt') b.style.cursor = cropGriff(e) >= -1 ? (cropGriff(e) === -1 ? 'move' : 'nwse-resize') : 'default'; return; }
    const [nx, ny] = nachBild(e);
    if (modus === 'pan') { S.panX = start.px + e.clientX - start.x; S.panY = start.py + e.clientY - start.y; transform(); }
    else if (modus === 'crop') { vorAenderung(); cropZieh(start.crop, start.griff, nx, ny, e.shiftKey); S.geaendert = true; ueberZeichnen(); }
    else if (modus === 'linie') { S.ausrichtLinie = [S.zStart, [nx, ny]]; ueberZeichnen(); }
    else if (modus === 'text') { ziel.x = clamp(start.tx + nx - S.zStart[0], 0, 1); ziel.y = clamp(start.ty + ny - S.zStart[1], 0, 1); S.geaendert = true; zeichnenBald(); }
    else if (modus === 'healQuelle') { ziel.sx = clamp(nx, 0, 1); ziel.sy = clamp(ny, 0, 1); S.geaendert = true; zeichnenBald(); }
    else if (modus === 'mzeichnen') { const m = S.zeichnet; let p = [clamp(nx, 0, 1), clamp(ny, 0, 1)]; if (e.shiftKey && ['linie', 'pfeil', 'masz'].includes(m.t)) { const a = m.pts[0]; Math.abs(p[0] - a[0]) * S.cache.geo.w > Math.abs(p[1] - a[1]) * S.cache.geo.h ? p[1] = a[1] : p[0] = a[0]; } if (m.t === 'frei' || m.t === 'marker') m.pts.push(p); else m.pts[1] = p; ueberZeichnen(); }
    else if (modus === 'mzieh') { const dx = nx - S.zStart[0], dy = ny - S.zStart[1]; ziel.pts = start.pts.map(([a, c]) => [a + dx, c + dy]); S.geaendert = true; zeichnenBald(); }
    else if (modus === 'maske') maskeMove(start, nx, ny);
    else if (modus === 'kimalen') { const l = S.kiZeichnet.pts[S.kiZeichnet.pts.length - 1]; if (Math.hypot(nx - l[0], ny - l[1]) > 0.002) S.kiZeichnet.pts.push([nx, ny]); ueberZeichnen(); }
    else if (modus === 'mpunkt') { ziel.pts[start.i] = [clamp(nx, 0, 1), clamp(ny, 0, 1)]; S.geaendert = true; zeichnenBald(); }
  });
  b.addEventListener('pointerleave', () => { S.maus = null; ueberZeichnen(); });
  b.addEventListener('pointerdown', (e) => {
    if (!S.cache.heal) return; b.setPointerCapture(e.pointerId); const [nx, ny] = nachBild(e); S.zStart = [nx, ny]; const cv = $('#edBild');
    const pan = () => { modus = 'pan'; start = { x: e.clientX, y: e.clientY, px: S.panX, py: S.panY }; b.style.cursor = 'grabbing'; };
    if (e.button === 1 || e.button === 2 || S.leertaste) return pan();
    if (S.pipette) { const w = E.pipetteWB(S.cache.heal, nx, ny); aendern(ed => Object.assign(ed.adj, w), { neuPanel: true }); S.pipette = false; b.style.cursor = 'default'; toast(tr('Weißabgleich gesetzt')); return; }
    if (S.wz === 'zuschnitt') {
      if (S.linieModus) { modus = 'linie'; return; }
      const g = cropGriff(e); if (g >= -1) { modus = 'crop'; vorAenderung(); start = { crop: { ...(S.edit.geo.crop || { x: 0, y: 0, w: 1, h: 1 }) }, griff: g }; } else pan(); return;
    }
    if (S.wz === 'retusche') {
      const W = cv.width, H = cv.height;
      const quelle = S.edit.heal.find(o => Math.hypot((o.sx - nx) * W, (o.sy - ny) * H) < o.r * W && (o === S.healAuswahl || S.healAlleQuellen));
      if (quelle) { vorAenderung(); modus = 'healQuelle'; ziel = quelle; return; }
      const treffer = S.edit.heal.find(o => Math.hypot((o.x - nx) * W, (o.y - ny) * H) < o.r * W);
      if (treffer && !e.altKey) { S.healAuswahl = treffer; ueberZeichnen(); return; }
      if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return pan();
      if (S.healArt === 'clone' && e.altKey) { S.cloneQuelle = [nx, ny]; ueberZeichnen(); return; }
      const r = S.healGroesse / 100; let q;
      if (S.healArt === 'clone') { if (!S.cloneQuelle) { toast(tr('Stempel: zuerst mit Alt+Klick die Quelle wählen'), 'warn'); return; } q = S.cloneQuelle; S.cloneQuelle = [q[0] + 0.0001, q[1]]; }
      else q = E.healQuelleSuchen(S.cache.heal, nx, ny, r);
      const op = { t: S.healArt, x: nx, y: ny, r, sx: q[0], sy: q[1] }; aendern(ed => ed.heal.push(op)); S.healAuswahl = op; panel(); return;
    }
    if (S.wz === 'text') {
      const x2 = cv.getContext('2d'); const t = [...S.edit.text].reverse().find(tt => { const m = E.textMasse(x2, tt, cv.width, cv.height); const [rx, ry, rw, rh] = m.rect; return nx * cv.width >= rx - 8 && nx * cv.width <= rx + rw + 8 && ny * cv.height >= ry - 8 && ny * cv.height <= ry + rh + 8; });
      if (t) { vorAenderung(); S.auswahlText = t; modus = 'text'; ziel = t; start = { tx: t.x, ty: t.y }; panel(); return; }
      if (nx >= 0 && ny >= 0 && nx <= 1 && ny <= 1) { if (S.auswahlText) { S.auswahlText = null; panel(); ueberZeichnen(); } else textNeu(nx, ny); return; }
      return pan();
    }
    if (S.wz === 'masken') { if (nx < -0.05 || ny < -0.05 || nx > 1.05 || ny > 1.05) return pan(); const z = maskeDown(e, clamp(nx, 0, 1), clamp(ny, 0, 1)); if (z) { modus = 'maske'; start = z; } else pan(); return; }
    if (S.wz === 'ki' && S.kiMalen) { S.kiZeichnet = { r: S.kiPinsel / 100, pts: [[clamp(nx, 0, 1), clamp(ny, 0, 1)]] }; modus = 'kimalen'; ueberZeichnen(); return; }
    if (S.wz === 'markup') {
      const W = cv.width, H = cv.height;
      if (S.auswahlMarkup) { const i = S.auswahlMarkup.pts.findIndex(pp => Math.hypot((pp[0] - nx) * W * S.z, (pp[1] - ny) * H * S.z) < 9); if (i >= 0) { vorAenderung(); modus = 'mpunkt'; ziel = S.auswahlMarkup; start = { i }; return; } }
      const t = markupTreffer(S.edit.markup, nx * W, ny * H, W, H);
      if (S.markupWz === 'zeiger' || (t && t === S.auswahlMarkup)) { if (t) { vorAenderung(); S.auswahlMarkup = t; modus = 'mzieh'; ziel = t; start = { pts: t.pts.map(p => p.slice()) }; panel(); zeichnen(); } else { S.auswahlMarkup = null; panel(); zeichnen(); pan(); } return; }
      if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return pan();
      const basis = { id: uid(), t: S.markupWz, farbe: S.markupFarbe, staerke: S.markupStaerke, fuellung: S.markupWz === 'flaeche' ? (S.markupFuellung || 35) : S.markupFuellung };
      if (S.markupWz === 'nummer') { const m = { ...basis, pts: [[nx, ny]], nr: naechsteNummer(S.edit.markup), text: '' }; aendern(ed => ed.markup.push(m)); S.auswahlMarkup = m; panel(); setTimeout(() => $('#edPanel textarea')?.focus(), 30); return; }
      if (S.markupWz === 'flaeche') {
        if (!S.zeichnet) S.zeichnet = { ...basis, pts: [[nx, ny]], offen: true };
        else { const a = S.zeichnet.pts[0]; if (S.zeichnet.pts.length > 2 && Math.hypot((a[0] - nx) * W * S.z, (a[1] - ny) * H * S.z) < 12) return flaecheFertig(); S.zeichnet.pts.push([nx, ny]); }
        ueberZeichnen(); return;
      }
      S.zeichnet = { ...basis, pts: [[nx, ny], [nx, ny]], text: S.markupWz === 'notiz' ? tr('Hinweis') : '' }; modus = 'mzeichnen'; return;
    }
    pan();
  });
  b.addEventListener('dblclick', () => { if (S.wz === 'markup' && S.zeichnet?.t === 'flaeche') flaecheFertig(); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('pointerup', () => {
    if (modus === 'crop' || modus === 'text' || modus === 'healQuelle' || modus === 'mzieh' || modus === 'mpunkt') { S.geaendert = true; zeichnen(); speichernBald(); undoKnoepfe(); if (modus === 'healQuelle') neuHeal(); }
    if (modus === 'maske') { S.geaendert = true; zeichnen(); speichernBald(); undoKnoepfe(); if (start?.art === 'raufziehen' || start?.art === 'malen') panel(); }
    if (modus === 'kimalen' && S.kiZeichnet) { S.kiStriche.push(S.kiZeichnet); S.kiZeichnet = null; panel(); ueberZeichnen(); }
    if (modus === 'linie' && S.ausrichtLinie) {
      const [[ax, ay], [bx, by]] = S.ausrichtLinie, cv = $('#edBild'); const dx = (bx - ax) * cv.width, dy = (by - ay) * cv.height;
      if (Math.hypot(dx, dy) > 20) { let a = Math.atan2(dy, dx) * 180 / Math.PI; let k = a; while (k > 45) k -= 90; while (k < -45) k += 90; aendern(e => e.geo.angle = clamp(Math.round((e.geo.angle - k) * 10) / 10, -45, 45), { neuPanel: true }); toast(tr('Ausgerichtet')); }
      S.ausrichtLinie = null; S.linieModus = false; panel();
    }
    if (modus === 'mzeichnen' && S.zeichnet) {
      const m = S.zeichnet, cv = $('#edBild'); S.zeichnet = null; const [a, c] = [m.pts[0], m.pts[m.pts.length - 1]];
      const gross = Math.hypot((a[0] - c[0]) * cv.width, (a[1] - c[1]) * cv.height) > 6 || m.pts.length > 3;
      if (!gross && ['rechteck', 'ellipse', 'wolke', 'kreuz', 'haken'].includes(m.t)) { const d = 0.06; m.pts = [[a[0] - d, a[1] - d * cv.width / cv.height], [a[0] + d, a[1] + d * cv.width / cv.height]]; }
      if (!gross && m.t === 'notiz') m.pts[1] = [clamp(a[0] + 0.15, 0, 0.95), clamp(a[1] - 0.12, 0.05, 1)];
      if (gross || ['rechteck', 'ellipse', 'wolke', 'kreuz', 'haken', 'notiz'].includes(m.t)) { if (m.t === 'frei' || m.t === 'marker') m.pts = vereinfachen(m.pts, 0.002); aendern(ed => ed.markup.push(m)); S.auswahlMarkup = m; panel(); if (['notiz', 'masz'].includes(m.t)) setTimeout(() => { const ta = $('#edPanel textarea'); ta?.focus(); ta?.select(); }, 30); }
      ueberZeichnen();
    }
    if (modus === 'pan') b.style.cursor = S.wz === 'markup' ? 'crosshair' : 'default';
    modus = null; ziel = null;
  });
  function flaecheFertig() { const m = S.zeichnet; S.zeichnet = null; if (m.pts.length < 3) { ueberZeichnen(); return; } delete m.offen; aendern(ed => ed.markup.push(m)); S.auswahlMarkup = m; panel(); }
  S.flaecheFertig = flaecheFertig;
}
function vereinfachen(pts, tol) { const out = [pts[0]]; for (const p of pts.slice(1)) { const l = out[out.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > tol) out.push(p); } if (out.length === 1) out.push(pts[pts.length - 1]); return out; }
function cropGriff(e) {
  const c = S.edit.geo.crop || { x: 0, y: 0, w: 1, h: 1 }; const r = $('#buehne').getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
  const g = griffe(c).findIndex(([hx, hy]) => { const [sx, sy] = nachSchirm(hx, hy); return Math.abs(sx - mx) < 14 && Math.abs(sy - my) < 14; }); if (g >= 0) return g;
  const [a, b] = nachSchirm(c.x, c.y), [d, f] = nachSchirm(c.x + c.w, c.y + c.h); return mx > a && mx < d && my > b && my < f ? -1 : -2;
}
function zoomAuf(z, cx, cy) {
  const b = $('#buehne'); z = clamp(z, (S.fit || 0.1) * 0.5, 8); cx ??= b.clientWidth / 2; cy ??= b.clientHeight / 2;
  const cv = $('#edBild'); const alt = S.z || 1; const ix = (cx - S.off.x) / alt, iy = (cy - S.off.y) / alt;
  S.zoom = z; const bw = b.clientWidth, bh = b.clientHeight; S.panX = cx - ix * z - (bw - cv.width * z) / 2; S.panY = cy - iy * z - (bh - cv.height * z) / 2; transform();
}

/** Tasten im Editor */
export function taste(e) {
  if (!aktiv() || e.target.closest('input,textarea,select')) return false; const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.shiftKey ? redo() : undo(); return true; } if ((e.ctrlKey || e.metaKey) && k === 'y') { redo(); return true; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { nachbar(1); return true; } if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') { nachbar(-1); return true; }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === '\\' || e.key === '#') { if (!S.vorherHalten) { S.vorherHalten = true; zeichnen(); } return true; }
  if (e.key === ' ') { S.leertaste = true; $('#buehne').style.cursor = 'grab'; return true; }
  if (e.key === 'Escape') { if (S.zeichnet) { S.zeichnet = null; ueberZeichnen(); return true; } if (S.wz !== 'anpassen') { wzWahl('anpassen'); return true; } speichern(); location.hash = '#/bibliothek'; return true; }
  if (e.key === 'Enter' && S.zeichnet?.t === 'flaeche') { S.flaecheFertig(); return true; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.wz === 'markup' && S.auswahlMarkup) { const m = S.auswahlMarkup; aendern(ed => ed.markup = ed.markup.filter(x => x !== m)); S.auswahlMarkup = null; panel(); return true; }
    if (S.wz === 'text' && S.auswahlText) { const t = S.auswahlText; aendern(ed => ed.text = ed.text.filter(x => x !== t)); S.auswahlText = null; panel(); return true; }
    if (S.wz === 'masken' && maske()) { const i = S.maskeIdx; aendern(ed => ed.masken.splice(i, 1)); S.maskeIdx = S.edit.masken.length ? Math.min(i, S.edit.masken.length - 1) : null; panel(); return true; }
    if (S.wz === 'ki' && S.kiStriche?.length) { S.kiStriche.pop(); panel(); ueberZeichnen(); return true; }
    if (S.wz === 'retusche' && S.healAuswahl) { const o = S.healAuswahl; aendern(ed => ed.heal = ed.heal.filter(x => x !== o), { neuPanel: true }); S.healAuswahl = null; return true; }
    return false;
  }
  if (e.key === '0') { einpassen(); return true; } if (e.key === '1' && S.wz !== 'markup') { zoomAuf(1 / (S.cache.geo.cw / S.cache.geo.w)); return true; }
  const w = WZ.find(x => x.key === k); if (w) { wzWahl(w.k); return true; }
  if (k === 'v' && S.wz === 'markup') { S.markupWz = 'zeiger'; panel(); return true; }
  if (k === 'o' && S.wz === 'masken') { S.maskeZeigen = !S.maskeZeigen; panel(); return true; }
  if ((e.key === '[' || e.key === ']') && S.wz === 'masken' && S.pinsel) { S.pinsel.groesse = clamp(S.pinsel.groesse * (e.key === ']' ? 1.2 : 1 / 1.2), 0.5, 30); ueberZeichnen(); return true; }
  return false;
}
export function tasteLos(e) { if (!aktiv()) return; if (e.key === '\\' || e.key === '#') { S.vorherHalten = false; zeichnen(); } if (e.key === ' ') { S.leertaste = false; $('#buehne').style.cursor = 'default'; } }
export function verlassen() { if (S) speichern(); }
void esc; void menue;
