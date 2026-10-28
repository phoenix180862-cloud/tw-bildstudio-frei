// TW Bildstudio – kostenlose Fassung: Ersatz für js/ki.js (keine KI, keine Mail-Texte, kein Diktat, keine Master-App-Daten)
export const kiEinst = () => ({ key: '', model: '' });
export const kiBereit = () => false;
export const schluesselDialog = async () => false;
export const mailSchreiben = async () => { throw new Error('In der kostenlosen Fassung nicht enthalten.'); };
export const kunden = async () => [];
export const kundeZurBaustelle = async () => null;
export const kontakte = () => [];
export const sprachOk = () => false;
export const diktat = () => null;
