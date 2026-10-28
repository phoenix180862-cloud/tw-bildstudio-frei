// TW Bildstudio – öffentliche, kostenlose Fassung (window.TW_FREI aus frei-config.js)
import { tr, trz } from './i18n.js';
// Im Repo ist TW_FREI = false (Thomas' volle Fassung); das Paket tools/frei_paket.py setzt true.
// In der freien Fassung: keine KI, kein Google/Drive/Gmail/Fotos, keine Baustellen/Master-App/Firebase,
// keine Firmendaten im Briefkopf – dafür ein dezenter, fester Hinweis auf den Hersteller (Werbung).
export const FREI = !!(typeof window !== 'undefined' && window.TW_FREI === true);

/** Quellen/Wege, die nur in der Firmen-Fassung existieren */
export const NUR_FIRMA_QUELLEN = ['gfotos', 'baustelle', 'drive'];

export const HERSTELLER = {
  text: tr('Ein kostenloses Programm von Thomas Willwacher Fliesenlegermeister e.K.'),
  web: 'www.thomas-willwacher.de',
  url: 'https://www.thomas-willwacher.de'
};

/** fester Hersteller-Hinweis (nicht ausblendbar) – als DOM-Element */
export function herstellerHinweis(klasse = '') {
  const p = document.createElement('p'); p.className = 'frei-hersteller ' + klasse;
  const a = document.createElement('a'); a.href = HERSTELLER.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = HERSTELLER.web;
  p.append(HERSTELLER.text + ' – ', a);
  return p;
}

/* ───────── Installieren (Knopf „Als App installieren“) ───────── */
export const istInstalliert = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch (e) { return false; } };
export const istIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
