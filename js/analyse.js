// TW Bildstudio – Bild-Check: misst Schärfe, Rauschen, Belichtung, Kontrast, Farbstich und Schieflage
// und erzeugt daraus eine Ein-Klick-Verbesserung (Licht, Farbe, Schärfen, Entrauschen, Unschärfe-Rettung, Geraderichten).
import { histogramm, autoWerte, autoGeradeInfo, neutralMittel } from './engine.js';
import { tr, trz, zahl } from './i18n.js';

function graustufen(canvas, maxSeite = 900) {
  const k = Math.min(1, maxSeite / Math.max(canvas.width, canvas.height)), w = Math.max(16, Math.round(canvas.width * k)), h = Math.max(16, Math.round(canvas.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  return { g, w, h, k };
}
function laplaceVarianz(g, w, h) { let s = 0, s2 = 0, n = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; s += v; s2 += v * v; n++; } return s2 / n - (s / n) ** 2; }
function weich(g, w, h, sigma) { // separierbarer Gauß
  const r = Math.ceil(sigma * 3), ker = []; let su = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); ker.push(v); su += v; } ker.forEach((v, i) => ker[i] = v / su);
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = -r; j <= r; j++) s += g[y * w + Math.min(w - 1, Math.max(0, x + j))] * ker[j + r]; t[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = -r; j <= r; j++) s += t[Math.min(h - 1, Math.max(0, y + j)) * w + x] * ker[j + r]; o[y * w + x] = s; }
  return o;
}
/** Rauschschätzung nach Immerkær (robust gegen Kanten) – Standardabweichung in 0–255 */
function rauschen(g, w, h) {
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const gx = Math.abs(g[i + 1] - g[i - 1]), gy = Math.abs(g[i + w] - g[i - w]); if (gx + gy > 40) continue; // Kanten auslassen
    s += Math.abs(g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] - 2 * g[i - 1] + 4 * g[i] - 2 * g[i + 1] + g[i + w - 1] - 2 * g[i + w] + g[i + w + 1]); n++;
  }
  return n ? Math.sqrt(Math.PI / 2) * s / (6 * n) : 0;
}
/**
 * Schärfe: Wie viel Detail geht verloren, wenn man das Bild leicht weichzeichnet?
 * Scharfe Bilder verlieren viel (Verhältnis klein), unscharfe kaum (Verhältnis nahe 1).
 * Daraus wird der ungefähre Unschärfe-Radius (in Pixeln der Originalgröße) geschätzt.
 */
function schaerfe(g, w, h, k) {
  const v0 = laplaceVarianz(g, w, h) + 1e-6, v1 = laplaceVarianz(weich(g, w, h, 1.0), w, h), q = v1 / v0;
  // Erfahrungswerte: q≈0.12 gestochen scharf, ≈0.35 leicht weich, ≥0.6 deutlich unscharf
  const sigmaVorschau = Math.max(0, (q - 0.12) / 0.32 * 1.6), sigma = sigmaVorschau / k;
  const note = q < 0.22 ? tr('scharf') : q < 0.4 ? tr('leicht unscharf') : q < 0.6 ? tr('unscharf') : tr('stark unscharf');
  return { q, sigma, note, detail: v0 };
}
/**
 * Richtungs-Schärfe: dasselbe Prinzip wie oben, aber getrennt in 4 Richtungen (0°, 45°, 90°, 135°).
 * Verwacklung = in Bewegungsrichtung kaum Detail, quer dazu scharf. Fokus-Unschärfe = überall weich.
 */
function richtungen(g, w, h) {
  const R = [[1, 0, 0], [1, 1, 45], [0, 1, 90], [-1, 1, 135]], ker = [0.0044, 0.054, 0.242, 0.399, 0.242, 0.054, 0.0044];
  const erg = [];
  for (const [dx, dy, grad] of R) {
    const off = dy * w + dx; let a = 0, a2 = 0, b = 0, b2 = 0, n = 0;
    for (let y = 4; y < h - 4; y += 1) for (let x = 4; x < w - 4; x += 1) {
      const i = y * w + x, v = 2 * g[i] - g[i - off] - g[i + off];
      let s = 0; for (let k = -3; k <= 3; k++) { const j = i + k * off; s += (2 * g[j] - g[j - off] - g[j + off]) * ker[k + 3]; }
      a += v; a2 += v * v; b += s; b2 += s * s; n++;
    }
    const v0 = a2 / n - (a / n) ** 2 + 1e-6, v1 = b2 / n - (b / n) ** 2; erg.push({ grad, q: v1 / v0, detail: v0 });
  }
  return erg;
}
/** Länge der Verwacklung: Die Ableitung in Bewegungsrichtung hat bei einer Verwacklung um L Pixel Spitzen im Abstand L
 *  (Anfang und Ende der Schliere mit entgegengesetztem Vorzeichen) → deutliches Minimum der Autokorrelation bei L. */
function wackelLaenge(g, w, h, grad) {
  const [dx, dy] = { 0: [1, 0], 45: [1, 1], 90: [0, 1], 135: [-1, 1] }[grad], off = dy * w + dx, MAX = 48, R = new Float64Array(MAX + 1);
  const rand = MAX + 2, schritt = Math.max(1, Math.round(Math.sqrt((w * h) / 250000)));
  for (let y = rand; y < h - rand; y += schritt) for (let x = rand; x < w - rand; x += schritt) {
    const i = y * w + x, d0 = g[i + off] - g[i];
    for (let k = 0; k <= MAX; k++) { const j = i + k * off; R[k] += d0 * (g[j + off] - g[j]); }
  }
  let best = 0, bv = 0; for (let k = 2; k <= MAX; k++) { const v = R[k] / (R[0] || 1); if (v < bv) { bv = v; best = k; } }
  return { laenge: best ? best * (dx && dy ? Math.SQRT2 : 1) : 0, deutlich: -bv };
}
/** Bewegungsunschärfe: In Bewegungsrichtung fehlt das Detail (Kantenenergie), quer dazu ist es da. */
function bewegung(g, w, h) {
  const r = richtungen(g, w, h), d = (x) => r.find(e => e.grad === x).detail;
  const paare = [[0, 90], [45, 135]].map(([a, b]) => { const v = d(a) / d(b); return v < 1 ? { aniso: 1 / v, winkel: a } : { aniso: v, winkel: b }; });
  const p = paare[0].aniso >= paare[1].aniso ? paare[0] : paare[1];
  // Bewegungsrichtung = Richtung mit dem wenigsten Detail
  const bewRichtung = d(p.winkel) < d((p.winkel + 90) % 180) ? p.winkel : (p.winkel + 90) % 180;
  const L = p.aniso > 2.5 ? wackelLaenge(g, w, h, bewRichtung) : { laenge: 0, deutlich: 0 };
  return { aniso: p.aniso, winkel: bewRichtung, laenge: Math.round(L.laenge) || Math.round(Math.max(4, Math.min(40, Math.sqrt(p.aniso) * 3))), laengeSicher: L.deutlich, richtungen: r };
}

/** vollständiger Bild-Check. canvas = zugeschnittenes, retuschiertes Bild ohne Farbbearbeitung */
export function bildCheck(canvas, { rettungAktiv = false } = {}) {
  const { g, w, h, k } = graustufen(canvas); const H = histogramm(canvas);
  const pct = (a, p) => { let s = 0; const t = H.n * p; for (let i = 0; i < 256; i++) { s += a[i]; if (s >= t) return i; } return 255; };
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * H.l[i]; const mittel = sum / H.n;
  const lo = pct(H.l, 0.01), hi = pct(H.l, 0.99), schwarz = H.l[0] / H.n, weiss = (H.l[255] + H.l[254]) / H.n;
  const neutral = neutralMittel(canvas), mr = neutral.r, mg = neutral.g, mb = neutral.b, mm = (mr + mg + mb) / 3 || 1;
  const stich = Math.max(Math.abs(mr - mm), Math.abs(mg - mm), Math.abs(mb - mm)) / mm * (neutral.sicher ? 1 : 0.5); // ohne neutrale Flächen (z. B. Sonnenuntergang) nicht anmeckern
  const sch = schaerfe(g, w, h, k), rau = rauschen(g, w, h), bew = bewegung(g, w, h), ger = autoGeradeInfo(canvas), schief = ger.sicher > 0.35 ? ger.winkel : 0;
  const verwackelt = bew.aniso > 4; if (verwackelt) { sch.q = Math.max(sch.q, Math.min(0.9, 0.25 + bew.aniso / 40)); sch.note = 'verwackelt'; }
  const p = [];
  const ampel = (ok, warn) => ok ? 'gruen' : warn ? 'gelb' : 'rot';
  if (rettungAktiv && sch.q >= 0.22) p.push({ k: 'schaerfe', titel: tr('Schärfe'), wert: sch.note + tr(' – Rettung aktiv'), stufe: 'gelb', tipp: tr('Die Unschärfe-Rettung ist eingeschaltet. Länge/Radius und Stärke feinjustieren – oder für mehr Schärfe „✦ KI-Schärfen“.') });
  else p.push({ k: 'schaerfe', titel: tr('Schärfe'), wert: sch.note, stufe: ampel(sch.q < 0.22, sch.q < 0.4), tipp: sch.q < 0.22 ? tr('Bild ist scharf – leichtes Nachschärfen für Web/Druck genügt.') : verwackelt ? tr('Wirkt verwackelt (Richtung ca. {0}°) – Unschärfe-Rettung „Verwacklung“ hilft.', bew.winkel) : tr('Leicht bis deutlich weich (ca. {0} px) – Unschärfe-Rettung „Fokus“ und Schärfen helfen.', sch.sigma.toFixed(1).replace('.', ',')) });
  p.push({ k: 'rauschen', titel: tr('Bildrauschen'), wert: rau < 2.5 ? tr('gering') : rau < 5 ? tr('mittel') : tr('hoch'), stufe: ampel(rau < 2.5, rau < 5), tipp: rau < 2.5 ? tr('Kaum Rauschen.') : tr('Körnig (z. B. dunkles Handyfoto) – Rauschen reduzieren.') });
  p.push({ k: 'belichtung', titel: tr('Belichtung'), wert: mittel < 70 ? tr('zu dunkel') : mittel > 180 ? tr('zu hell') : tr('gut'), stufe: ampel(mittel >= 85 && mittel <= 165, mittel >= 70 && mittel <= 180), tipp: mittel < 85 ? tr('Zu dunkel – Belichtung und Tiefen anheben.') : mittel > 165 ? tr('Zu hell – Belichtung und Lichter senken.') : tr('Helligkeit passt.') });
  p.push({ k: 'kontrast', titel: tr('Kontrast'), wert: hi - lo < 120 ? tr('flau') : hi - lo < 160 ? tr('etwas flau') : tr('gut'), stufe: ampel(hi - lo >= 160, hi - lo >= 120), tipp: hi - lo < 160 ? tr('Flau/milchig – Kontrast, Weiß/Schwarz und „Dunst entfernen“.') : tr('Kontrastumfang gut.') });
  p.push({ k: 'clipping', titel: tr('Ausgefressen / abgesoffen'), wert: `${zahl(weiss * 100)} % / ${zahl(schwarz * 100)} %`, stufe: ampel(weiss < 0.01 && schwarz < 0.01, weiss < 0.04 && schwarz < 0.04), tipp: weiss >= 0.01 ? tr('Helle Stellen ohne Zeichnung – Lichter zurückholen.') : schwarz >= 0.01 ? tr('Schatten ohne Zeichnung – Tiefen aufhellen.') : tr('Keine Probleme.') });
  p.push({ k: 'farbstich', titel: tr('Farbstich'), wert: stich < 0.06 ? tr('neutral') : mg > (mr + mb) / 2 + 3 && Math.abs(mr - mb) < 6 ? tr('grünlich') : mr > mb ? tr('warm/gelblich') : tr('kühl/bläulich'), stufe: ampel(stich < 0.06, stich < 0.14), tipp: stich < 0.06 ? tr('Farben neutral.') : tr('Farbstich – Weißabgleich (Pipette auf Weißes) oder Auto.') });
  p.push({ k: 'schief', titel: tr('Ausrichtung'), wert: Math.abs(schief) < 0.6 ? tr('gerade') : tr('{0}° schief', zahl(-schief)), stufe: ampel(Math.abs(schief) < 0.6, Math.abs(schief) < 1.5), tipp: Math.abs(schief) < 0.6 ? tr('Kanten stehen gerade.') : tr('Bild ist schief – Auto-Ausrichten.') });
  return { punkte: p, werte: { schaerfe: sch, rauschen: rau, bewegung: bew, verwackelt, schief, mittel, lo, hi, stich, neutral } };
}

/** Ein-Klick-Verbesserung aus dem Bild-Check: liefert Änderungen an der Bearbeitung */
export function autoVerbessern(canvas, { geraderichten = true, retten = true, skala = 1 } = {}) {
  // skala = Pixel dieser Fläche je Pixel im Original (Vorschau ist kleiner) – Radius/Länge werden ins Original umgerechnet
  const c = bildCheck(canvas), w = c.werte, adj = autoWerte(canvas);
  // Schärfen nach Unschärfe, Rauschen nach Messung
  adj.noise = w.rauschen < 2.5 ? 0 : Math.round(Math.min(70, (w.rauschen - 2) * 9));
  adj.sharpen = Math.round(Math.min(70, 18 + (w.schaerfe.q - 0.1) * 70 - adj.noise * 0.25));
  adj.clarity = Math.round(Math.min(30, 10 + (w.hi - w.lo < 150 ? 10 : 0)));
  adj.dehaze = w.hi - w.lo < 130 ? 18 : 0;
  const aend = { adj };
  if (retten && w.schaerfe.q >= 0.3) {
    const k = Math.max(0.2, Math.min(1, 900 / Math.max(canvas.width, canvas.height))), r1 = (v) => Math.round(v * 10) / 10;
    aend.deblur = w.verwackelt ? { art: 'bewegung', laenge: Math.round(Math.min(60, w.bewegung.laenge / k / skala)), winkel: w.bewegung.winkel, staerke: 55, radius: 1.5 } : { art: 'fokus', radius: r1(Math.min(8, Math.max(0.6, w.schaerfe.sigma / skala))), staerke: 60, laenge: 12, winkel: 0 };
  }
  if (aend.deblur) adj.sharpen = Math.min(adj.sharpen, 28); // nach der Entfaltung nur noch leicht nachschärfen (sonst Säume)
  if (geraderichten && Math.abs(w.schief) >= 0.6 && Math.abs(w.schief) < 8) aend.angle = w.schief;
  return { aend, check: c };
}
