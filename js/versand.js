// TW Bildstudio – Versenden: E-Mail (Gmail, Text von der KI), WhatsApp, Baustellen-App (Büro-Chat), Baustelle/Master-App, Teilen
// Firmen-Wege (E-Mail mit KI, Baustellen-App, Baustelle) stehen in versand-firma.js; die kostenlose Fassung hat nur WhatsApp und Teilen.
import { state, einstSpeichern } from './store.js';
import { exportDatei, EXPORT_DEFAULT, wasserzeichenDialog } from './export.js';
import { $, el, toast, modal, fortschritt, dateiSpeichern } from './util.js';
import { tabMail, tabBauapp, tabBaustelle } from './versand-firma.js';
import { FREI } from './frei.js';
import { tr, trz } from './i18n.js';

const VERSAND_O = { groesse: 'web2048', format: 'jpeg', qualitaet: 85, maxKB: 900, muster: FREI ? '{titel} {nr}' : '{baustelle} {titel} {nr}', web: false, wz: false, legende: true, metadaten: true, einpassen: 'zuschneiden' };
async function dateien(recs, o, p) { const out = []; for (let i = 0; i < recs.length; i++) { p?.set(i, recs.length, tr('Bild {0} von {1} wird aufbereitet …', i + 1, recs.length)); out.push(await exportDatei(recs[i], o, i + 1)); } return out; }

export async function versandDialog(ids, exportO = null, startWeg = null) {
  const recs = (ids || []).map(id => state.recs.get(id)).filter(Boolean); if (!recs.length) { toast(tr('Bitte zuerst Bilder auswählen.'), 'warn'); return; }
  const o = { ...EXPORT_DEFAULT, ...VERSAND_O, ...(state.einst.versandO || {}), ...(exportO ? { wz: exportO.wz, legende: exportO.legende } : {}) };
  let weg = startWeg || state.einst.versandWeg || (FREI ? 'teilen' : 'mail');
  const box = el('div'); const inh = el('div', { style: 'margin-top:10px' });
  const wege = FREI ? [['teilen', '📤', tr('Teilen …'), tr('WhatsApp, Mail-Programm, Handy-/Windows-Teilen')], ['whatsapp', '💬', 'WhatsApp', tr('Teilen / WhatsApp Web')]]
    : [['mail', '✉', tr('E-Mail'), tr('mit Text von der KI')], ['whatsapp', '💬', 'WhatsApp', tr('Teilen / WhatsApp Web')], ['bauapp', '👷', tr('Baustellen-App'), tr('an Mitarbeiter')], ['baustelle', '🏗', tr('Baustelle / Master-App'), tr('Ablage in 05_Bilder')], ['teilen', '📤', tr('Teilen …'), tr('Windows-/Handy-Teilen')]];
  if (!wege.some(w => w[0] === weg)) weg = wege[0][0];
  const zeichne = () => {
    box.innerHTML = '';
    box.append(el('div', { class: 'karten', style: `grid-template-columns:repeat(${wege.length},1fr)` }, ...wege.map(([k, i, t, s]) => el('button', { class: 'karte' + (weg === k ? ' an' : ''), onclick: () => { weg = k; state.einst.versandWeg = k; einstSpeichern(); zeichne(); } }, el('span', { class: 'ico' }, i), el('b', {}, t), el('small', {}, s)))),
      el('div', { class: 'zeile hinweis', style: 'margin-top:8px' }, trz(recs.length, '{0} Bild', '{0} Bilder') + ' · ' + tr('lange Seite {0} px', o.groesse === 'mail' ? 1280 : 2048),
        el('select', { class: 'inp', onchange: (e) => { o.groesse = e.target.value; merke(); } }, el('option', { value: 'web2048', selected: o.groesse === 'web2048' }, tr('groß (2048 px)')), el('option', { value: 'mail', selected: o.groesse === 'mail' }, tr('klein (1280 px)')), el('option', { value: 'orig', selected: o.groesse === 'orig' }, tr('Original'))),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.legende, onchange: (e) => { o.legende = e.target.checked; merke(); } }), tr('Legende unter das Bild')),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: o.wz, onchange: (e) => { o.wz = e.target.checked; merke(); } }), tr('Wasserzeichen')), el('button', { class: 'btn klein', onclick: () => wasserzeichenDialog(recs[0].id) }, '…')),
      inh);
    inh.innerHTML = ''; ({ mail: tabMail, whatsapp: tabWhatsapp, bauapp: tabBauapp, baustelle: tabBaustelle, teilen: tabTeilen })[weg](inh, recs, o);
  };
  const merke = () => { state.einst.versandO = { groesse: o.groesse, legende: o.legende, wz: o.wz }; einstSpeichern(); };
  zeichne();
  await modal({ titel: (FREI ? tr('Teilen') : tr('Versenden')) + ' (' + trz(recs.length, '{0} Bild', '{0} Bilder') + ')', inhalt: box, breit: true, hilfe: 'versand', klasse: 'versand' });
}

/* ───────── WhatsApp ───────── */
function tabWhatsapp(box, recs, o) {
  const nr = el('input', { class: 'inp', placeholder: tr('Handynummer (optional), z. B. 0170 1234567'), value: state.einst.waNummer || '', style: 'width:260px' });
  const txt = el('textarea', { class: 'inp', rows: 3, style: 'width:100%', placeholder: tr('Nachricht (optional)') });
  const kannTeilen = !!navigator.canShare;
  box.append(
    el('div', { class: 'notiz' }, kannTeilen ? tr('Am schnellsten: „Teilen“ öffnet das Teilen-Fenster von Windows bzw. vom Handy – dort WhatsApp antippen, Kontakt wählen, fertig.') : tr('Dein Browser kann hier nicht direkt teilen – nutze WhatsApp Web (Bild wird in die Zwischenablage gelegt, im Chat nur Strg+V).')),
    el('label', { class: 'lbl' }, tr('Nachricht')), txt,
    el('div', { class: 'zeile', style: 'margin-top:10px' },
      kannTeilen ? el('button', { class: 'btn primaer gross', onclick: async () => { await teilen(recs, o, txt.value); } }, tr('📤 Teilen → WhatsApp')) : null,
      el('span', { class: 'platz' }), nr,
      el('button', { class: 'btn gross', title: tr('Legt das (erste) Bild in die Zwischenablage und öffnet WhatsApp Web – dort im Chat Strg+V drücken'), onclick: async () => {
        state.einst.waNummer = nr.value; einstSpeichern();
        const p = fortschritt(tr('Bild für WhatsApp')); try { const d = await dateien(recs.slice(0, 1), { ...o, format: 'png', maxKB: 0 }, p); await navigator.clipboard.write([new ClipboardItem({ 'image/png': d[0].blob })]); p.zu(); } catch (e) { p.zu(); toast(tr('Zwischenablage nicht erlaubt: ') + e.message, 'warn'); }
        let n = nr.value.replace(/[^\d+]/g, ''); if (n.startsWith('0')) n = '49' + n.slice(1); n = n.replace(/^\+/, '');
        window.open(n ? `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(txt.value)}` : 'https://web.whatsapp.com/', 'whatsapp');
        toast(tr('Bild liegt in der Zwischenablage – im WhatsApp-Chat einfach Strg+V drücken.') + (recs.length > 1 ? tr(' (WhatsApp Web: Bilder einzeln einfügen)') : ''), 'ok', 8000);
      } }, tr('🟢 WhatsApp Web (Strg+V)'))),
    el('p', { class: 'hinweis' }, tr('Für mehrere Bilder auf einmal: „Teilen“ – oder Bilder exportieren und in WhatsApp Web per Ziehen anhängen.')));
}
async function teilen(recs, o, text = '') {
  const p = fortschritt(tr('Bilder vorbereiten'));
  try {
    const d = await dateien(recs, o, p); p.zu(); const files = d.map(x => new File([x.blob], x.name, { type: x.blob.type }));
    if (!navigator.canShare?.({ files })) { toast(tr('Teilen wird hier nicht unterstützt – Bilder werden heruntergeladen.'), 'warn'); d.forEach(x => dateiSpeichern(x.blob, x.name)); return; }
    await navigator.share({ files, text: text || undefined, title: tr('Bilder') });
  } catch (e) { p.zu(); if (e.name !== 'AbortError') toast(tr('Teilen: ') + e.message, 'fehler'); }
}
function tabTeilen(box, recs, o) {
  box.append(el('p', {}, tr('Öffnet das normale Teilen-Fenster (Windows bzw. Handy): WhatsApp, Outlook, Teams, Nearby-Share, AirDrop, Signal … – was auf dem Gerät installiert ist.')), el('button', { class: 'btn primaer gross', onclick: () => teilen(recs, o) }, tr('📤 Teilen')));
}
void $;
