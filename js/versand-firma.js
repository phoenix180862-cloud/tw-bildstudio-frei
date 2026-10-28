// TW Bildstudio – kostenlose Fassung: Ersatz für js/versand-firma.js (kein Gmail, keine Baustellen-App/Firebase, keine Baustellen-Ablage)
const hinweis = (box) => { box.textContent = 'In der kostenlosen Fassung nicht enthalten.'; };
export const tabMail = hinweis;
export const tabBauapp = hinweis;
export const tabBaustelle = hinweis;
