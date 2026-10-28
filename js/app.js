// TW Bildstudio – App-Rahmen: Seitenleiste, Navigation, Tasten, Ziehen & Ablegen, Google-Status
import * as store from './store.js';
import { state, on, zaehler, ordnerNeu, ordnerLoeschen, ordnerSpeichern, einsortieren, importieren, einstSpeichern, bearbeitungSpeichern, istBild } from './store.js';
import * as lib from './library.js';
import * as ed from './editor.js';
import * as src from './sources.js';
import * as exp from './export.js';
import * as drive from './drive.js';
import * as hilfe from './help.js?v=20261028-2';
import * as db from './db.js';
import * as startseite from './start.js';
import { webglOk, normalisiereBearbeitung, istBearbeitet } from './engine.js';
import { $, $$, el, toast, modal, eingabe, bestaetigen, fmtBytes, debounce } from './util.js';
import { FREI, herstellerHinweis, istInstalliert, istIOS } from './frei.js';
import { tr, trz, SPRACHE, SPRACHEN, spracheSetzen, htmlUebersetzen } from './i18n.js';

const BS = window.BS = {
  import: (k) => src.holen(k),
  importMenue: (a) => src.importMenue(a),
  einstellungen: () => einstellungen(),
  installieren: () => installieren(),
  export: (ids) => exp.exportDialog(ids || lib.auswahlIds()),
  drucken: (ids) => exp.druckDialog(ids || lib.auswahlIds()),
  vorschlag: (id) => exp.vorschlagDialog(id || lib.auswahlIds()[0]),
  versand: async (ids) => (await import('./versand.js')).versandDialog(ids || lib.auswahlIds()),
  hilfe: (id) => hilfe.oeffnen(id),
  ordnerNeu: async () => { const n = await eingabe(tr('Neuer Ordner'), '', tr('Name, z. B. „Bad OG“, „Referenz Webseite“, „Mängel“')); if (!n) return null; const o = ordnerNeu(n); seite(); toast(tr('Ordner „{0}“ angelegt', n) + (o.taste ? tr(' – Taste {0} sortiert hinein', o.taste) : '')); return o; },
  kopieren: (id) => { const r = state.recs.get(id); if (!r) return; state.einst.zuletztKopiert = { edit: normalisiereBearbeitung(r.edit), von: r.name, gruppen: ['licht', 'farbe', 'kurven', 'hsl', 'details', 'effekte'] }; einstSpeichern(); toast(tr('Bearbeitung von „{0}“ kopiert – mit Strg+Umschalt+V auf andere Bilder übertragen', r.name)); },
  einfuegen: (ids) => uebertragenAuf(ids, state.einst.zuletztKopiert),
  uebertragen: (id) => uebertragenDialog(id),
  autoVerbessern: (ids) => autoVerbessernViele(ids || lib.auswahlIds()),
  zuruecksetzen: async (ids) => { if (!await bestaetigen(tr('Bearbeitung von {0} Bild(ern) zurücksetzen?', ids.length))) return; for (const id of ids) { const r = state.recs.get(id); if (r) await bearbeitungSpeichern(r, null); } lib.neuZeichnen(); },
  state, store, lib, ed, drive
};

/* ───────── Start ───────── */
async function start() {
  if (!webglOk()) { $('#inhalt').innerHTML = tr('<div class="leer-box"><h2>Browser zu alt</h2><p>Das Bildstudio braucht Chrome oder Edge (WebGL2).</p></div>'); return; }
  await store.init();
  htmlUebersetzen(); sprachKnopf(); hilfe.init(); seite(); if (FREI) freiKopf(); else googlePille(); ereignisse();
  addEventListener('hashchange', route); route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || (FREI && window.isSecureContext))) navigator.serviceWorker.register('sw.js').then((reg) => { if (FREI) aktualisierungBeobachten(reg); }).catch(() => { });
}

/* ───────── Seitenleiste ───────── */
export function seite() {
  const s = $('#seite'), z = zaehler(); s.innerHTML = '';
  const lb = el('div', { class: 'logo-box' }, startseite.logo(tr('Bildstudio'))); s.append(el('div', { class: 's-marke', title: tr('Startseite'), onclick: () => { location.hash = '#/start'; } }, lb));
  s.append(el('div', { class: 's-link' + (aktuelleRoute() === 'start' ? ' an' : ''), onclick: () => { document.body.classList.remove('seite-auf'); location.hash = '#/start'; } }, el('span', {}, '⌂'), tr('Startseite')));
  const link = (v, ico, t, n) => el('div', { class: 's-link' + (state.ansicht === v && aktuelleRoute() === 'bibliothek' ? ' an' : ''), onclick: () => { state.ansicht = v; state.auswahl.clear(); document.body.classList.remove('seite-auf'); location.hash = '#/bibliothek'; lib.neu(); seite(); } }, el('span', {}, ico), t, el('span', { class: 'n' }, n ?? ''));
  s.append(el('div', { class: 's-gruppe' }, tr('Bilder holen')),
    el('div', { class: 'import-btns' }, ...src.QUELLEN.filter(q => (FREI ? ['pc', 'pcordner', 'importordner'] : ['pc', 'gfotos', 'baustelle', 'drive', 'importordner']).includes(q.k)).map(q => el('button', { class: 'btn', title: q.h, onclick: () => src.holen(q.k) }, el('i', {}, q.i), q.t)),
      el('button', { class: 'btn', onclick: (e) => src.importMenue(e.currentTarget) }, el('i', {}, '⋯'), tr('Weitere Quellen …'))),
    el('div', { class: 's-gruppe' }, tr('Bibliothek')),
    link('alle', '▦', tr('Alle Bilder'), z.alle), link('unsortiert', '◌', tr('Unsortiert'), z.unsortiert), link('favoriten', '★', tr('Favoriten'), z.favoriten), link('bearbeitet', '✎', tr('Bearbeitet'), z.bearbeitet), ...(z.abgelehnt ? [link('abgelehnt', '✕', tr('Abgelehnt'), z.abgelehnt)] : []),
    el('div', { class: 's-gruppe' }, tr('Ordner'), el('button', { class: 'ib', title: tr('Neuer Ordner'), onclick: () => BS.ordnerNeu() }, '＋')));
  if (!state.ordner.length) s.append(el('div', { class: 'hinweis', style: 'padding:0 9px' }, tr('Lege Ordner an (＋) – dann Bilder markieren und Taste 1–9 drücken oder auf den Ordner ziehen.')));
  for (const o of state.ordner) {
    const d = el('div', { class: 's-link' + (state.ansicht === 'ordner:' + o.id ? ' an' : ''), title: tr('Klick = öffnen · Bilder hierher ziehen = einsortieren · Rechtsklick = Menü'), onclick: (e) => { if (e.target.closest('.mehr')) return; state.ansicht = 'ordner:' + o.id; state.auswahl.clear(); document.body.classList.remove('seite-auf'); location.hash = '#/bibliothek'; lib.neu(); seite(); } },
      el('span', { class: 'dot', style: { background: o.farbe } }), el('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, o.name), o.taste ? el('span', { class: 'taste', title: tr('Taste ') + o.taste }, o.taste) : null, el('span', { class: 'n' }, z.ordner[o.id] || 0), el('button', { class: 'ib mehr', style: 'width:22px;height:22px', onclick: (e) => ordnerMenue(o, e.currentTarget) }, '⋯'));
    d.addEventListener('contextmenu', (e) => { e.preventDefault(); ordnerMenue(o, null, { x: e.clientX, y: e.clientY }); });
    d.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-bs-ids')) { e.preventDefault(); d.classList.add('drop'); } });
    d.addEventListener('dragleave', () => d.classList.remove('drop'));
    d.addEventListener('drop', async (e) => { const ids = e.dataTransfer.getData('text/x-bs-ids'); d.classList.remove('drop'); if (!ids) return; e.preventDefault(); e.stopPropagation(); await lib.sortiere(JSON.parse(ids), o.id); seite(); });
    s.append(d);
  }
  const sp = el('div', { class: 'speicher' }); s.append(sp);
  db.speicherInfo().then(i => { if (!i) return; sp.append(el('div', {}, tr('Speicher: {0} von {1}', fmtBytes(i.usage || 0), fmtBytes(i.quota || 0))), el('div', { class: 'pbar' }, el('i', { style: { width: Math.min(100, (i.usage || 0) / (i.quota || 1) * 100) + '%' } }))); });
  if (FREI) {
    s.append(el('div', { class: 's-gruppe' }, tr('Einstellungen')), el('div', { class: 's-link', onclick: einstellungen }, el('span', {}, '⚙'), tr('Urheber, Wasserzeichen …')),
      installierbar() ? el('div', { class: 's-link', title: tr('Bildstudio als eigenes Programm mit Symbol installieren'), onclick: installieren }, el('span', {}, '⬇'), tr('Als App installieren')) : null,
      herstellerHinweis());
    freiInstallKnopf(); return;
  }
  s.append(el('div', { class: 's-gruppe' }, tr('Einstellungen')), el('div', { class: 's-link', onclick: einstellungen }, el('span', {}, '⚙'), tr('Urheber, Wasserzeichen …')),
    el('div', { class: 's-link', title: installEreignis ? tr('Bildstudio als eigenes Programm mit Desktop-Symbol installieren') : tr('Desktop-Symbol und Verknüpfung herunterladen'), onclick: installieren }, el('span', {}, '⬇'), installEreignis ? tr('Als App installieren') : tr('Desktop-Symbol holen')));
}
function ordnerMenue(o, anker, pos) {
  lib.menue(anker, [
    { i: '✎', t: tr('Umbenennen'), f: async () => { const n = await eingabe(tr('Ordner umbenennen'), o.name); if (n) { o.name = n; await ordnerSpeichern(); seite(); lib.neu(); } } },
    { i: '⌨', t: tr('Taste ändern (1–9)'), f: async () => { const n = +(await eingabe(tr('Taste für „{0}“ (1–9, leer = keine)', o.name), o.taste || '')); const alt = state.ordner.find(x => x.taste === n && x !== o); if (alt) alt.taste = null; o.taste = n >= 1 && n <= 9 ? n : null; await ordnerSpeichern(); seite(); } },
    { i: '🎨', t: tr('Farbe ändern'), f: () => { const i = el('input', { type: 'color', value: o.farbe, style: 'position:fixed;left:-50px' }); document.body.append(i); i.oninput = async () => { o.farbe = i.value; await ordnerSpeichern(); seite(); }; i.onchange = () => i.remove(); i.click(); } },
    '-',
    { i: '⇪', t: tr('Ganzen Ordner exportieren …'), f: () => exp.exportDialog(lib.alleImOrdner ? lib.alleImOrdner(o.id) : [...state.recs.values()].filter(r => r.ordner === o.id).map(r => r.id)) },
    { i: FREI ? '📤' : '✉', t: FREI ? tr('Ganzen Ordner teilen …') : tr('Ganzen Ordner versenden …'), f: () => BS.versand([...state.recs.values()].filter(r => r.ordner === o.id).map(r => r.id)) },
    { i: '🖨', t: tr('Ganzen Ordner drucken …'), f: () => exp.druckDialog([...state.recs.values()].filter(r => r.ordner === o.id).map(r => r.id)) },
    '-',
    { i: '🗑', t: tr('Ordner löschen (Bilder bleiben)'), f: async () => { if (await bestaetigen(tr('Ordner „{0}“ löschen? Die Bilder bleiben in der Bibliothek (unsortiert).', o.name))) { await ordnerLoeschen(o.id); if (state.ansicht === 'ordner:' + o.id) state.ansicht = 'alle'; seite(); lib.neu(); } } }
  ], pos);
}
async function einstellungen() {
  const e = state.einst; const u = el('input', { class: 'inp', style: 'width:100%', value: e.urheber }), c = el('input', { class: 'inp', style: 'width:100%', value: e.copyright });
  if (FREI) return einstellungenFrei(e, u, c);
  const ok = await modal({ titel: tr('Einstellungen'), hilfe: 'einstellungen', inhalt: el('div', {}, sprachWahl(),
    el('label', { class: 'lbl' }, tr('Urheber (wird beim Export in jedes Bild geschrieben)')), u, el('label', { class: 'lbl' }, tr('Copyright-Vermerk')), c,
    el('div', { class: 'zeile', style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: () => installieren() }, tr('⬇ App installieren / Desktop-Symbol')), el('button', { class: 'btn', onclick: () => exp.wasserzeichenDialog() }, tr('💧 Wasserzeichen einstellen …')), el('button', { class: 'btn', onclick: () => src.importOrdner({}, true) }, tr('⟳ Import-Ordner ändern …')), el('button', { class: 'btn', onclick: async () => { (await import('./ki.js')).schluesselDialog(); } }, tr('✨ KI-Zugang …'))),
    el('p', { class: 'hinweis' }, tr('Die KI läuft automatisch über Google mit dem Schlüssel aus der Master-App – nichts einzutragen.')),
    el('div', { class: 'notiz' }, tr('Deine Bilder liegen sicher im Speicher dieses Browsers auf diesem PC. Die Originale werden nie verändert – alle Bearbeitungen sind jederzeit zurücknehmbar.')),
    el('button', { class: 'btn', onclick: async () => { if (await bestaetigen(tr('Wirklich ALLE Bilder, Ordner und Bearbeitungen aus dem Bildstudio löschen? (Google Fotos, Drive und PC bleiben unberührt)'), tr('Alles leeren'), tr('Alles löschen'))) { await db.leeren(); location.reload(); } } }, tr('🗑 Bildstudio komplett leeren'))),
    knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Speichern'), art: 'primaer', wert: true }] });
  if (ok) { e.urheber = u.value; e.copyright = c.value; await einstSpeichern(); toast(tr('Gespeichert')); }
}
/** Einstellungen der kostenlosen Fassung: ohne KI, ohne Google – mit Hersteller-Hinweis und Lizenzen */
async function einstellungenFrei(e, u, c) {
  u.placeholder = tr('z. B. Max Mustermann'); c.placeholder = tr('z. B. © Max Mustermann');
  const ok = await modal({ titel: tr('Einstellungen'), hilfe: 'einstellungen', inhalt: el('div', {}, sprachWahl(),
    el('label', { class: 'lbl' }, tr('Urheber (wird beim Export in jedes Bild geschrieben)')), u, el('label', { class: 'lbl' }, tr('Copyright-Vermerk')), c,
    el('div', { class: 'zeile', style: 'margin-top:12px' }, installierbar() ? el('button', { class: 'btn', onclick: () => installieren() }, tr('⬇ Als App installieren')) : null, el('button', { class: 'btn', onclick: () => exp.wasserzeichenDialog() }, tr('💧 Wasserzeichen einstellen …')), el('button', { class: 'btn', onclick: () => src.importOrdner({}, true) }, tr('⟳ Import-Ordner ändern …'))),
    el('div', { class: 'notiz' }, tr('Deine Bilder liegen nur im Speicher dieses Browsers auf diesem Gerät – sie werden nirgendwohin hochgeladen. Die Originale werden nie verändert – alle Bearbeitungen sind jederzeit zurücknehmbar.')),
    el('button', { class: 'btn', onclick: async () => { if (await bestaetigen(tr('Wirklich ALLE Bilder, Ordner und Bearbeitungen aus dem Bildstudio löschen? (Die Dateien auf deinem PC bzw. Handy bleiben unberührt)'), tr('Alles leeren'), tr('Alles löschen'))) { await db.leeren(); location.reload(); } } }, tr('🗑 Bildstudio komplett leeren')),
    el('div', { style: 'margin-top:14px' }, herstellerHinweis(), el('p', { class: 'hinweis' }, el('a', { href: 'LIZENZEN.txt', target: '_blank', rel: 'noopener' }, tr('Lizenzen der verwendeten Bibliotheken und Schriften'))))),
    knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Speichern'), art: 'primaer', wert: true }] });
  if (ok) { e.urheber = u.value; e.copyright = c.value; await einstSpeichern(); toast(tr('Gespeichert')); }
}

/* ───────── Als App installieren / Desktop-Symbol ───────── */
let installEreignis = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEreignis = e; seite(); });
addEventListener('appinstalled', () => { installEreignis = null; toast(tr('Bildstudio ist als App installiert – Symbol liegt auf dem Desktop und im Startmenü.')); seite(); });
/** freie Fassung: Installieren möglich? (Browser bietet es an oder iPhone/iPad – dort per Hinweis) */
const installierbar = () => !istInstalliert() && (!!installEreignis || istIOS());
function freiInstallKnopf() { const k = $('#kopfInstall'); if (k) k.classList.toggle('an', installierbar()); }
async function installierenFrei() {
  if (installEreignis) { installEreignis.prompt(); const r = await installEreignis.userChoice; if (r.outcome === 'accepted') installEreignis = null; seite(); return; }
  if (istIOS()) return modal({ titel: tr('Auf iPhone / iPad installieren'), hilfe: 'einstellungen', inhalt: el('div', {}, el('ol', {}, el('li', {}, tr('Diese Seite in Safari öffnen.')), el('li', {}, tr('Unten (iPad: oben) auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).')), el('li', {}, tr('„Zum Home-Bildschirm“ wählen und „Hinzufügen“ tippen.'))), el('p', { class: 'hinweis' }, tr('Danach startet das Bildstudio wie eine App – mit eigenem Symbol und ohne Browserleiste.'))), knoepfe: [{ text: 'OK', art: 'primaer', wert: true }] });
  return modal({ titel: tr('Als App installieren'), hilfe: 'einstellungen', inhalt: el('div', {}, el('p', {}, tr('Dein Browser bietet die Installation gerade nicht direkt an. So geht es trotzdem:')), el('ul', {}, el('li', {}, tr('Chrome / Edge am PC: rechts in der Adresszeile auf das Symbol „App installieren“ (Bildschirm mit Pfeil) klicken – oder Menü ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“.')), el('li', {}, tr('Android: Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.')), el('li', {}, tr('iPhone / iPad: in Safari Teilen-Symbol → „Zum Home-Bildschirm“.')))), knoepfe: [{ text: 'OK', art: 'primaer', wert: true }] });
}
async function installieren() {
  if (FREI) return installierenFrei();
  if (installEreignis) { installEreignis.prompt(); const r = await installEreignis.userChoice; if (r.outcome === 'accepted') installEreignis = null; seite(); return; }
  const a = el('a', { href: 'img/bildstudio.ico', download: 'Bildstudio.ico' }); document.body.append(a); a.click(); a.remove();
  const url = new Blob([`[InternetShortcut]\r\nURL=${location.href.split('#')[0]}\r\nIconIndex=0\r\n`], { type: 'application/octet-stream' });
  setTimeout(() => { const b = el('a', { href: URL.createObjectURL(url), download: 'TW Bildstudio.url' }); document.body.append(b); b.click(); b.remove(); }, 500);
  toast(tr('Symbol und Verknüpfung liegen in „Downloads“ – „TW Bildstudio.url“ auf den Desktop ziehen.'), 'ok', 7000);
}

/* ───────── Sprache: Knopf im Kopf (jede Sprache in eigener Schreibweise, ohne Flaggen) ───────── */
const sprachName = (c) => (SPRACHEN.find(s => s[0] === c) || SPRACHEN[0])[1];
function sprachMenue(anker) {
  lib.menue(anker, SPRACHEN.map(([c, n]) => ({ i: c === SPRACHE ? '✓' : '', t: n, k: c.toUpperCase(), f: () => { if (c !== SPRACHE) spracheSetzen(c); } })));
}
function sprachKnopf() {
  const b = el('button', { class: 'btn sprache', id: 'kopfSprache', title: tr('Sprache wählen'), 'aria-label': tr('Sprache wählen'), onclick: (e) => sprachMenue(e.currentTarget) },
    el('span', { class: 'gl', 'aria-hidden': 'true' }, '🌐'), el('span', { class: 'sp-name' }, sprachName(SPRACHE)), el('span', { class: 'sp-kurz' }, SPRACHE.toUpperCase()));
  $('#kopf').append(b);
}
function sprachWahl() {
  return el('div', {}, el('label', { class: 'lbl' }, tr('Sprache')),
    el('select', { class: 'inp', id: 'einstSprache', onchange: (e) => spracheSetzen(e.target.value) }, ...SPRACHEN.map(([c, n]) => el('option', { value: c, selected: c === SPRACHE }, n))));
}

/* ───────── Kopfleiste der kostenlosen Fassung, automatische Updates ───────── */
function freiKopf() {
  $('#kopfKI')?.remove(); $('#googlePille')?.remove();
  const v = $('#kopfVersand'); v.textContent = tr('📤 Teilen'); v.title = tr('Ausgewählte Bilder teilen: WhatsApp, Mail-Programm, Handy-/Windows-Teilen');
  $('#kopfImport').title = tr('Bilder holen: PC, ganzer Ordner, Kamera, Zwischenablage, Internet');
  $('#kopf').append(el('button', { class: 'btn gruen', id: 'kopfInstall', title: tr('Bildstudio als eigenes Programm mit Symbol installieren – startet dann ohne Browser'), onclick: () => installieren() }, tr('⬇ Als App installieren')));
  freiInstallKnopf();
}
function aktualisierungBeobachten(reg) {
  const hatte = !!navigator.serviceWorker.controller; // beim allerersten Besuch kein Hinweis
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hatte) updateHinweis(); });
  const pruefen = () => reg.update().catch(() => { });
  setInterval(pruefen, 60 * 60 * 1000); addEventListener('visibilitychange', () => { if (!document.hidden) pruefen(); });
}
function updateHinweis() {
  if ($('#updateHinweis')) return;
  document.body.append(el('div', { id: 'updateHinweis', role: 'status' }, el('span', {}, tr('✨ Neue Version des Bildstudios ist da')),
    el('button', { class: 'btn primaer', onclick: async () => { await ed.speichern(); location.reload(); } }, tr('Aktualisieren')),
    el('button', { class: 'ib', title: tr('Später (beim nächsten Start automatisch)'), onclick: (e) => e.currentTarget.parentNode.remove() }, '✕')));
}
BS.updateHinweis = updateHinweis;

/* ───────── Bearbeitung übertragen ───────── */
const GRUPPEN = [['licht', tr('Licht'), ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']], ['farbe', tr('Farbe & S/W'), ['temp', 'tint', 'vibrance', 'saturation', 'bw']], ['kurven', tr('Gradationskurve')], ['hsl', tr('Farbmischer')], ['details', tr('Details'), ['clarity', 'dehaze', 'sharpen', 'noise']], ['effekte', tr('Effekte'), ['vignette', 'vignetteMid', 'grain', 'grainSize', 'fade', 'splitShHue', 'splitShSat', 'splitHiHue', 'splitHiSat']], ['rettung', tr('Unschärfe-Rettung')], ['masken', tr('Masken (lokale Anpassungen)')], ['geo', tr('Zuschnitt, Drehen, Perspektive & Objektiv')], ['rahmen', tr('Rahmen')], ['text', tr('Text-Ebenen')], ['markup', tr('Einzeichnungen')]];
async function uebertragenAuf(ids, kopie) {
  if (!kopie) { toast(tr('Erst eine Bearbeitung kopieren (Rechtsklick → Bearbeitung kopieren).'), 'warn'); return; }
  const q = normalisiereBearbeitung(kopie.edit); let n = 0;
  for (const id of ids) {
    const r = state.recs.get(id); if (!r) continue; const e = normalisiereBearbeitung(r.edit);
    for (const g of kopie.gruppen) { const def = GRUPPEN.find(x => x[0] === g); if (def?.[2]) for (const k of def[2]) e.adj[k] = q.adj[k]; else if (g === 'kurven') e.curves = JSON.parse(JSON.stringify(q.curves)); else if (g === 'hsl') e.hsl = JSON.parse(JSON.stringify(q.hsl)); else if (g === 'geo') e.geo = JSON.parse(JSON.stringify(q.geo)); else if (g === 'rahmen') e.frame = { ...q.frame }; else if (g === 'text') e.text = JSON.parse(JSON.stringify(q.text)); else if (g === 'markup') e.markup = JSON.parse(JSON.stringify(q.markup)); else if (g === 'masken') e.masken = JSON.parse(JSON.stringify(q.masken)); else if (g === 'rettung') e.deblur = { ...q.deblur }; }
    e.look = q.look; await bearbeitungSpeichern(r, e); n++;
  }
  toast(tr('Bearbeitung auf {0} Bild(er) übertragen', n)); lib.neuZeichnen();
}
/* ───────── Mehrere Bilder automatisch verbessern (Bild-Check je Bild) ───────── */
async function autoVerbessernViele(ids) {
  if (!ids.length) return; const { autoVerbessern } = await import('./analyse.js'); const E = await import('./engine.js'); const { fortschritt } = await import('./util.js');
  const ok = await modal({ titel: tr('✨ {0} Bild(er) automatisch verbessern', ids.length), hilfe: 'bild-check', inhalt: el('div', {}, el('p', {}, tr('Jedes Bild wird einzeln geprüft (Schärfe, Rauschen, Licht, Farbe, Ausrichtung) und passend verbessert. Bestehende Zuschnitte, Retuschen und Einzeichnungen bleiben erhalten; Licht & Farbe werden neu gesetzt.')),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'avGerade', checked: state.einst.autoGerade !== false }), tr('auch gerade richten')), el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'avRetten', checked: state.einst.autoRetten !== false }), tr('Unschärfe retten'))),
    knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Los geht’s'), art: 'gruen', wert: (b) => ({ gerade: b.querySelector('#avGerade').checked, retten: b.querySelector('#avRetten').checked }) }] });
  if (!ok) return; const fp = fortschritt(tr('Automatisch verbessern')); let n = 0;
  for (const id of ids) {
    if (fp.abgebrochen) break; const r = state.recs.get(id); if (!r) continue; fp.set(n, ids.length, r.name);
    try {
      const bmp = await store.bitmap(r); const e = normalisiereBearbeitung(r.edit);
      const roh = E.rendern(bmp, r.id + ':auto', { ...e, deblur: { art: 'aus' } }, { maxW: 1600, maxH: 1600, ohneFarbe: true });
      const G = E.gl(), skala = roh.width / Math.max(1, E.ausgabeGroesse(e.geo, bmp.width, bmp.height).w); void G;
      const { aend } = autoVerbessern(roh, { geraderichten: ok.gerade, retten: ok.retten, skala });
      Object.assign(e.adj, aend.adj); if (aend.deblur) e.deblur = { ...e.deblur, ...aend.deblur }; if (aend.angle != null) e.geo.angle = Math.max(-45, Math.min(45, Math.round((e.geo.angle + aend.angle) * 10) / 10));
      await bearbeitungSpeichern(r, e); n++;
    } catch (err) { console.warn(r.name, err); }
  }
  fp.zu(); toast(tr('{0} Bild(er) automatisch verbessert – einzeln nachjustieren im Bearbeiten-Modus', n)); lib.neuZeichnen();
}
async function uebertragenDialog(id) {
  await ed.speichern(); const r = state.recs.get(id); if (!r) return; const gew = new Set(['licht', 'farbe', 'kurven', 'hsl', 'details', 'effekte']); let ziel = 'auswahl';
  const anzAus = [...state.auswahl].filter(x => x !== id).length;
  const inhalt = el('div', {}, el('p', {}, tr('Von „{0}“ übertragen:', r.name)),
    el('div', { class: 'spalten' }, ...GRUPPEN.map(([k, t]) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: gew.has(k), onchange: (e) => e.target.checked ? gew.add(k) : gew.delete(k) }), t))),
    el('label', { class: 'lbl' }, tr('Auf welche Bilder?')),
    el('div', { class: 'tabs' }, ...[['auswahl', tr('Ausgewählte ({0})', anzAus)], ['ordner', tr('Ganzer Ordner')], ['ansicht', tr('Alle in der Ansicht')]].map(([v, t]) => el('button', { class: ziel === v ? 'an' : '', onclick: (e) => { ziel = v; $$('button', e.target.parentNode).forEach(b => b.classList.toggle('an', b === e.target)); } }, t))),
    el('p', { class: 'hinweis' }, tr('Tipp: Ein Bild einer Serie fertig bearbeiten, dann hier auf alle anderen übertragen – gleiches Licht, gleiche Farben.')));
  const ok = await modal({ titel: tr('Bearbeitung übertragen'), inhalt, hilfe: 'uebertragen', knoepfe: [{ text: tr('Abbrechen'), wert: false }, { text: tr('Übertragen'), art: 'primaer', wert: true }] });
  if (!ok) return;
  const ids = ziel === 'auswahl' ? [...state.auswahl].filter(x => x !== id) : ziel === 'ordner' ? [...state.recs.values()].filter(x => x.ordner && x.ordner === r.ordner && x.id !== id).map(x => x.id) : store.sichtbareListe().map(x => x.id).filter(x => x !== id);
  if (!ids.length) { toast(tr('Keine Zielbilder – in der Bibliothek erst mehrere Bilder auswählen.'), 'warn'); return; }
  uebertragenAuf(ids, { edit: r.edit, gruppen: [...gew] });
}

/* ───────── KI-Knopf im Kopf: KI-Werkstatt oder Mail mit KI ───────── */
async function kiMenue() {
  const ki = await import('./ki.js'); const bereit = ki.kiBereit();
  const imEditor = aktuelleRoute() === 'bearbeiten';
  const ids = imEditor ? [state.fokus].filter(Boolean) : lib.auswahlIds();
  const bildId = ids[0] || state.fokus || null;
  const karte = (i, t, s, f) => el('button', { class: 'karte', style: 'text-align:left;padding:14px', onclick: () => { zu(); f(); } }, el('div', { style: 'font-size:26px' }, i), el('b', {}, t), el('div', { class: 'hinweis' }, s));
  let zu = () => { };
  const status = bereit
    ? el('div', { class: 'notiz' }, tr('✓ Google-KI verbunden (Schlüssel aus der Master-App)'))
    : el('div', { class: 'notiz', style: 'border-color:var(--rot)' }, tr('Auf diesem Gerät ist in der Master-App noch kein Google-KI-Schlüssel hinterlegt. Öffne die Master-App und tippe dort einmal auf „Gemini KI“ – danach läuft die KI hier automatisch. '),
      el('a', { href: '../', target: '_blank', rel: 'noopener', class: 'btn klein', style: 'margin-left:6px' }, tr('Master-App öffnen')));
  const inhalt = el('div', {}, status,
    el('div', { class: 'karten', style: 'grid-template-columns:1fr 1fr;margin-top:12px' },
      karte('✦', tr('KI-Werkstatt'), bildId ? tr('Dieses Bild mit KI verändern: Gegenstände entfernen, Baustelle aufräumen, Licht, Himmel, Hintergrund, erweitern') : tr('Erst ein Bild in der Bibliothek anklicken – dann hier öffnen'), () => {
        if (!bildId) { toast(tr('Bitte zuerst ein Bild anklicken.'), 'warn'); location.hash = '#/bibliothek'; return; }
        ed.werkzeugOeffnen('ki'); if (!imEditor || state.fokus !== bildId) location.hash = '#/bearbeiten/' + bildId;
      }),
      karte('✉', tr('Mail mit KI schreiben'), ids.length ? trz(ids.length, '{0} Bild per E-Mail – die KI schreibt den Text (diktieren oder Stichworte)', '{0} Bilder per E-Mail – die KI schreibt den Text (diktieren oder Stichworte)') : tr('Erst Bilder auswählen – dann schreibt die KI die Begleitmail'), async () => {
        if (!ids.length) { toast(tr('Bitte zuerst Bilder auswählen.'), 'warn'); return; }
        ed.speichern(); (await import('./versand.js')).versandDialog(ids, null, 'mail');
      })));
  const p = modal({ titel: tr('✦ KI'), inhalt, breit: true, hilfe: 'ki-werkstatt' });
  zu = () => document.querySelector('.mdl-wrap .mdl-kopf .ib:last-child')?.click();
  await p;
}

/* ───────── Navigation ───────── */
const aktuelleRoute = () => (location.hash.replace(/^#\/?/, '').split('/')[0] || 'start');
function route() {
  const [r, id] = location.hash.replace(/^#\/?/, '').split('/'); const inh = $('#inhalt');
  if (r !== 'bearbeiten') ed.verlassen();
  $$('#reiter a').forEach(a => a.classList.toggle('an', a.dataset.r === (r || 'start')));
  document.body.classList.toggle('ed-modus', r === 'bearbeiten');
  if (r === 'bearbeiten') { hilfe.kontext('bearbeiten'); ed.zeigen(inh, id); }
  else if (r === 'bibliothek') { hilfe.kontext('bibliothek'); lib.zeigen(inh); }
  else { hilfe.kontext('start'); startseite.zeigen(inh); }
  seite();
}

/* ───────── Google-Status ───────── */
function googlePille() {
  const p = $('#googlePille'); const z = () => { const an = drive.verbunden(); p.classList.toggle('an', an); const k = drive.kontoBekannt(); p.querySelector('span').textContent = an ? (k?.emailAddress || tr('Google verbunden')) : tr('Google verbinden'); p.title = an ? tr('Google verbunden – Fotos, Drive und Gmail') : tr('Mit Google verbinden (Drive, Google Fotos, Gmail)'); };
  p.onclick = async () => { try { await drive.anmelden(); toast(tr('Mit Google verbunden')); } catch (e) { toast(e.message, 'fehler'); } z(); };
  drive.beiAenderung(z); z(); setInterval(z, 30000);
}

/* ───────── Ereignisse ───────── */
function ereignisse() {
  $('#kopfImport').onclick = (e) => src.importMenue(e.currentTarget);
  $('#kopfExport').onclick = () => { const ids = aktuelleRoute() === 'bearbeiten' ? [state.fokus] : lib.auswahlIds(); ed.speichern(); exp.exportDialog(ids); };
  $('#kopfHilfe').onclick = () => hilfe.oeffnen();
  if ($('#kopfKI')) $('#kopfKI').onclick = () => kiMenue();
  $('#kopfVersand').onclick = () => { const ids = aktuelleRoute() === 'bearbeiten' ? [state.fokus] : lib.auswahlIds(); ed.speichern(); BS.versand(ids); };
  $('#suchFeld').addEventListener('input', debounce((e) => { state.filter.suche = e.target.value; if (aktuelleRoute() !== 'bibliothek') location.hash = '#/bibliothek'; else lib.neuZeichnen(); }, 250));
  on('ordner', () => seite()); on('recs', debounce(() => seite(), 400));
  on('import', (s) => {
    let b = $('#importStatus'); if (!b) { b = el('div', { id: 'importStatus' }, el('div', { class: 'it' }), el('div', { class: 'pbar' }, el('i'))); document.body.append(b); }
    b.classList.toggle('an', !!s.laeuft); if (s.laeuft) { b.querySelector('.it').textContent = tr('Bilder werden übernommen: {0} / {1}', s.i || 0, s.n) + (s.name ? ' – ' + s.name : ''); b.querySelector('.pbar i').style.width = (s.n ? (s.i / s.n * 100) : 0) + '%'; }
  });
  // Tasten
  addEventListener('keydown', (e) => {
    if (document.querySelector('.mdl-wrap') || document.getElementById('sichten')) return;
    if (e.key === 'F1') { e.preventDefault(); hilfe.oeffnen(); return; }
    const strg = e.ctrlKey || e.metaKey;
    if (strg && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#suchFeld').focus(); return; }
    if (strg && e.key.toLowerCase() === 'e') { e.preventDefault(); $('#kopfExport').click(); return; }
    if (strg && e.key.toLowerCase() === 'p') { e.preventDefault(); ed.speichern(); exp.druckDialog(aktuelleRoute() === 'bearbeiten' ? [state.fokus] : lib.auswahlIds()); return; }
    if (strg && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); ed.speichern().then(() => BS.kopieren(state.fokus)); return; }
    if (strg && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); BS.einfuegen(aktuelleRoute() === 'bearbeiten' ? [state.fokus] : lib.auswahlIds()).then(() => { if (aktuelleRoute() === 'bearbeiten') ed.zeigen($('#inhalt'), state.fokus); }); return; }
    const ok = aktuelleRoute() === 'bearbeiten' ? ed.taste(e) : lib.taste(e);
    if (ok) e.preventDefault();
  });
  addEventListener('keyup', (e) => ed.tasteLos(e));
  // Ziehen aus dem Explorer
  let tiefe = 0; const dz = $('#dropZone'); const extern = (e) => [...(e.dataTransfer?.types || [])].includes('Files') && !document.body.classList.contains('zieht');
  addEventListener('dragenter', (e) => { if (!extern(e)) return; tiefe++; dz.classList.add('an'); });
  addEventListener('dragleave', (e) => { if (!extern(e)) return; tiefe = Math.max(0, tiefe - 1); if (!tiefe) dz.classList.remove('an'); });
  addEventListener('dragover', (e) => { if (extern(e)) e.preventDefault(); });
  addEventListener('drop', (e) => { if (!extern(e)) return; e.preventDefault(); tiefe = 0; dz.classList.remove('an'); src.dropDateien(e.dataTransfer); });
  // Einfügen (Strg+V)
  addEventListener('paste', (e) => { if (e.target.closest?.('input,textarea')) return; const files = [...(e.clipboardData?.files || [])].filter(istBild); if (files.length) { e.preventDefault(); importieren(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : tr('Zwischenablage_{0}_{1}.png', Date.now(), i), { type: f.type, lastModified: Date.now() })), { quelle: 'ablage', ordner: state.ansicht.startsWith('ordner:') ? state.ansicht.slice(7) : null }); } });
  addEventListener('beforeunload', () => { ed.speichern(); });
}

/* ───────── Beispielbilder (für Hilfe-Videos und zum Ausprobieren) ───────── */
/** Beispielbilder für Hilfe-Videos und Bildschirmfotos laden (nur Aufnahme/Test). liste.json: [{datei, datum, sterne?, farbe?, ordner?, baustelle?}] –
 *  mit „ordner“ werden genau diese Ordner angelegt (Name über tr(), damit sie in der gewählten Sprache erscheinen) */
BS.demoLaden = async (pfad = 'tests/demo/') => {
  const namen = await (await fetch(pfad + 'liste.json')).json(); const files = [];
  for (const n of namen) { const b = await (await fetch(pfad + n.datei)).blob(); files.push(new File([b], n.datei, { type: b.type, lastModified: Date.parse(n.datum) })); }
  const neu = await importieren(files, { quelle: 'pc' });
  const eigene = [...new Set(namen.map(n => n.ordner).filter(Boolean))];
  if (!state.ordner.length) { for (const n of (eigene.length ? eigene.map(x => tr(x)) : [tr('Bad OG'), tr('Schwimmbad'), tr('Referenz Webseite'), tr('Mängel')])) ordnerNeu(n); await ordnerSpeichern(); }
  for (let i = 0; i < neu.length; i++) {
    const z = namen.find(x => x.datei === neu[i].name); if (!z) continue;
    if (z.sterne) neu[i].sterne = z.sterne; if (z.farbe) neu[i].farbe = z.farbe;
    if (z.ordner) neu[i].ordner = state.ordner.find(o => o.name === tr(z.ordner))?.id || null;
    if (z.baustelle) neu[i].quelleInfo = { baustelle: z.baustelle, baustelleId: 'demo-' + z.baustelle };
  }
  await store.recsSpeichern(neu); seite(); lib.neu(); return neu.length;
};
void istBearbeitet; void einsortieren;
start();
