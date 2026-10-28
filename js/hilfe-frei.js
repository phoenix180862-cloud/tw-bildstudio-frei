// TW Bildstudio – Hilfe-Themen je nach Fassung und Sprache
//  • Firmen-Fassung (TW_FREI = false): alle Themen aus help-data.js
//  • kostenlose Fassung (TW_FREI = true): Themen mit "nur_firma" fallen weg (KI, Google, Baustelle …);
//    Themen mit "frei" bekommen die eigene Fassung (Titel/Bereich/Schritte, Kapiteltexte, "video": false = ohne Video)
//  • Sprache: alle Texte über tr() (Schlüssel = deutscher Text). Gibt es zum Thema ein Video in der gewählten Sprache
//    ("videos": {sprache: {kapitel, dauer}} – im Paket der freien Fassung), wird dieses genommen: hilfe/videos/<sprache>/<id>.webm
// Gefiltert wird hier, die Texte selbst bleiben vollständig in hilfe-themen/*.json (filtern statt löschen).
import * as D from './help-data.js?v=20261028-2';
import { tr, SPRACHE } from './i18n.js';

const FREI = !!(typeof window !== 'undefined' && window.TW_FREI === true);

export function freiFassung(themen) {
  return themen.filter(t => !t.nur_firma).map(t => {
    if (!t.frei) return t;
    const f = t.frei, n = { ...t };
    for (const k of ['titel', 'bereich', 'schritte']) if (f[k]) n[k] = f[k];
    if (f.kapitel) n.kapitel = (t.kapitel || []).map((k, i) => f.kapitel[i] != null ? { ...k, text: f.kapitel[i] } : k);
    if (f.video === false) { n.kapitel = []; n.dauer = 0; n.ohneVideo = true; }
    delete n.frei; return n;
  });
}

/** Texte in die gewählte Sprache; Video in der Sprache, falls vorhanden */
function sprachFassung(t) {
  const n = { ...t, titel: tr(t.titel), bereich: tr(t.bereich), schritte: t.schritte.map(s => tr(s)) };
  const v = t.videos?.[SPRACHE];
  if (v) { n.kapitel = v.kapitel; n.dauer = v.dauer; n.videoPfad = `hilfe/videos/${SPRACHE}/${t.id}.webm`; n.ohneVideo = false; }
  else n.kapitel = (t.kapitel || []).map(k => ({ ...k, text: tr(k.text) }));
  return n;
}

function aufbereiten() {
  if (!FREI) return { HILFE: D.HILFE.map(sprachFassung), HILFE_FUER: D.HILFE_FUER, HILFE_SEITE: D.HILFE_SEITE };
  const HILFE = freiFassung(D.HILFE).map(sprachFassung); const ids = new Set(HILFE.map(t => t.id));
  const HILFE_FUER = Object.fromEntries(Object.entries(D.HILFE_FUER).filter(([, id]) => ids.has(id)));
  const HILFE_SEITE = Object.fromEntries(Object.entries(D.HILFE_SEITE).map(([k, l]) => [k, l.filter(id => ids.has(id))]));
  return { HILFE, HILFE_FUER, HILFE_SEITE };
}
export const { HILFE, HILFE_FUER, HILFE_SEITE } = aufbereiten();
export const MIT_HANDBUCH = !FREI && SPRACHE === 'de'; // das PDF-Handbuch beschreibt die Firmen-Fassung (deutsch)
