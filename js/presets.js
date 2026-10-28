// TW Bildstudio – Vorgaben: Looks (Bildstile), Seitenverhältnisse, Exportgrößen, Papierformate
import { tr, trz } from './i18n.js';
export const LOOKS = [
  { id: 'natur', name: tr('Natürlich'), adj: { contrast: 8, vibrance: 15, clarity: 8, shadows: 10, highlights: -10 } },
  { id: 'brillant', name: tr('Brillant'), adj: { contrast: 18, vibrance: 30, saturation: 6, clarity: 18, highlights: -22, shadows: 18, whites: 10, sharpen: 25 } },
  { id: 'fliese', name: tr('Fliesen-Klar'), adj: { contrast: 14, clarity: 28, dehaze: 10, vibrance: 12, highlights: -30, shadows: 22, whites: 12, blacks: -6, sharpen: 35 } },
  { id: 'bad', name: tr('Bad hell'), adj: { exposure: 10, contrast: 6, highlights: -18, shadows: 28, whites: 18, temp: -4, vibrance: 10, clarity: 10 } },
  { id: 'pool', name: tr('Pool-Blau'), adj: { contrast: 12, vibrance: 28, clarity: 14, dehaze: 14, temp: -5 }, hsl: { aqua: [0, 22, 6], blau: [-4, 18, 0] } },
  { id: 'produkt', name: tr('Produkt weiß'), adj: { exposure: 14, whites: 30, highlights: -8, shadows: 20, contrast: 10, vibrance: 8, sharpen: 20 } },
  { id: 'warm', name: tr('Warm'), adj: { temp: 14, tint: 2, vibrance: 14, contrast: 6 } },
  { id: 'kuehl', name: tr('Kühl'), adj: { temp: -13, vibrance: 10, contrast: 6 } },
  { id: 'abend', name: tr('Abendlicht'), adj: { temp: 20, tint: 5, contrast: 10, vignette: -22, highlights: -20, splitHiSat: 18, splitHiHue: 35 } },
  { id: 'matt', name: tr('Matt'), adj: { fade: 35, contrast: -10, saturation: -10, vibrance: 8 }, curves: { rgb: [[0, 0.08], [0.25, 0.25], [0.75, 0.78], [1, 0.96]] } },
  { id: 'vintage', name: tr('Vintage'), adj: { fade: 25, temp: 9, saturation: -18, contrast: 6, grain: 25, vignette: -25, splitShHue: 200, splitShSat: 18, splitHiHue: 40, splitHiSat: 18 } },
  { id: 'film', name: tr('Film'), adj: { contrast: 14, saturation: -8, grain: 18, fade: 12 }, curves: { rgb: [[0, 0.03], [0.25, 0.2], [0.75, 0.82], [1, 0.98]] } },
  { id: 'sw', name: tr('Schwarz-Weiß'), adj: { bw: 1, contrast: 12, clarity: 10 } },
  { id: 'swkontrast', name: tr('S/W Kontrast'), adj: { bw: 1, contrast: 38, clarity: 30, blacks: -15, whites: 15, grain: 10 } },
  { id: 'sepia', name: tr('Sepia'), adj: { bw: 1, contrast: 8, splitShHue: 30, splitShSat: 45, splitHiHue: 38, splitHiSat: 35 } },
  { id: 'hdr', name: tr('HDR-Look'), adj: { highlights: -60, shadows: 60, clarity: 45, vibrance: 25, contrast: 6, sharpen: 30, dehaze: 12 } },
  { id: 'dunst', name: tr('Dunst weg'), adj: { dehaze: 45, contrast: 10, vibrance: 10, clarity: 12 } },
  { id: 'portrait', name: tr('Porträt'), adj: { clarity: -15, vibrance: 6, temp: 4, shadows: 12, highlights: -10, noise: 20 } }
];
export const VERHAELTNISSE = [
  { id: 'frei', name: tr('Frei'), r: null }, { id: 'orig', name: tr('Original'), r: 'orig' }, { id: '1:1', name: '1:1', r: 1 },
  { id: '4:5', name: '4:5', r: 4 / 5, tipp: tr('Instagram-Beitrag hoch') }, { id: '5:4', name: '5:4', r: 5 / 4 }, { id: '3:2', name: '3:2', r: 3 / 2 }, { id: '2:3', name: '2:3', r: 2 / 3 },
  { id: '4:3', name: '4:3', r: 4 / 3 }, { id: '3:4', name: '3:4', r: 3 / 4 }, { id: '16:9', name: '16:9', r: 16 / 9, tipp: tr('Webseite, YouTube') }, { id: '9:16', name: '9:16', r: 9 / 16, tipp: tr('Story, Reels') },
  { id: '1.91:1', name: '1,91:1', r: 1.91, tipp: tr('Facebook-/Link-Vorschau') }, { id: 'A-hoch', name: tr('DIN hoch'), r: 1 / Math.SQRT2, tipp: tr('DIN A0–A6 Hochformat') }, { id: 'A-quer', name: tr('DIN quer'), r: Math.SQRT2, tipp: tr('DIN A0–A6 Querformat') },
  { id: '3:1', name: '3:1', r: 3, tipp: tr('Webseiten-Banner') }
];
export const GROESSEN = [
  { id: 'orig', gruppe: tr('Allgemein'), name: tr('Originalgröße'), w: 0, h: 0 },
  { id: 'web2048', gruppe: tr('Allgemein'), name: tr('Web groß (2048 px)'), lang: 2048 },
  { id: 'web1600', gruppe: tr('Allgemein'), name: tr('Web mittel (1600 px)'), lang: 1600 },
  { id: 'mail', gruppe: tr('Allgemein'), name: tr('E-Mail / WhatsApp (1280 px)'), lang: 1280 },
  { id: 'klein', gruppe: tr('Allgemein'), name: tr('Klein (800 px)'), lang: 800 },
  { id: 'hp-voll', gruppe: tr('Webseite'), name: tr('Homepage Vollbild 1920×1080'), w: 1920, h: 1080 },
  { id: 'hp-banner', gruppe: tr('Webseite'), name: tr('Homepage Banner 1920×640'), w: 1920, h: 640 },
  { id: 'hp-galerie', gruppe: tr('Webseite'), name: tr('Galerie/Referenz 1600×1200'), w: 1600, h: 1200 },
  { id: 'ig-quadrat', gruppe: 'Instagram', name: tr('Beitrag quadratisch 1080×1080'), w: 1080, h: 1080 },
  { id: 'ig-hoch', gruppe: 'Instagram', name: tr('Beitrag hoch 1080×1350'), w: 1080, h: 1350 },
  { id: 'ig-story', gruppe: 'Instagram', name: tr('Story / Reel 1080×1920'), w: 1080, h: 1920 },
  { id: 'fb-beitrag', gruppe: 'Facebook', name: tr('Beitrag 1200×1500'), w: 1200, h: 1500 },
  { id: 'fb-link', gruppe: 'Facebook', name: tr('Link-Bild 1200×630'), w: 1200, h: 630 },
  { id: 'fb-titel', gruppe: 'Facebook', name: tr('Titelbild 1640×624'), w: 1640, h: 624 },
  { id: 'gp', gruppe: 'Google', name: tr('Unternehmensprofil 1200×900'), w: 1200, h: 900 },
  { id: 'eigen', gruppe: tr('Eigene'), name: tr('Eigene Größe …'), w: 1200, h: 800, eigen: true }
];
/** Papierformate in mm (hochkant) */
export const PAPIER = [
  { id: 'A0', name: tr('DIN A0'), w: 841, h: 1189 }, { id: 'A1', name: tr('DIN A1'), w: 594, h: 841 }, { id: 'A2', name: tr('DIN A2'), w: 420, h: 594 },
  { id: 'A3', name: tr('DIN A3'), w: 297, h: 420 }, { id: 'A4', name: tr('DIN A4'), w: 210, h: 297 }, { id: 'A5', name: tr('DIN A5'), w: 148, h: 210 }, { id: 'A6', name: tr('DIN A6 (Postkarte)'), w: 105, h: 148 },
  { id: '10x15', name: tr('Foto 10×15'), w: 102, h: 152 }, { id: '13x18', name: tr('Foto 13×18'), w: 127, h: 178 }, { id: '20x30', name: tr('Foto 20×30'), w: 203, h: 305 },
  { id: '30x45', name: tr('Poster 30×45'), w: 300, h: 450 }, { id: '50x70', name: tr('Poster 50×70'), w: 500, h: 700 }, { id: '60x90', name: tr('Poster 60×90'), w: 600, h: 900 },
  { id: 'eigen', name: tr('Eigenes Maß …'), w: 400, h: 300 }
];
export const MARKUP_FARBEN = ['#e5242a', '#ff8a00', '#ffd400', '#22c55e', '#00b4d8', '#2563eb', '#a855f7', '#ffffff', '#111111'];
export const TEXT_FARBEN = ['#ffffff', '#111111', '#e5242a', '#ffd400', '#22c55e', '#2563eb', '#c41e1e', '#94a3b8'];
