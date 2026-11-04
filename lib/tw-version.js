/* ═══════════════════════════════════════════════════════════════════
   TW-Version · gemeinsamer Baustein für alle TW-Apps (Thomas, 04.11.2026)
   Zeigt die laufende Version und meldet „Neue Version – jetzt aktualisieren“,
   sobald auf GitHub eine neuere Fassung veröffentlicht ist.

   EINBAU (Kanon-Datei: tw-business-suite/gemeinsam/tw-version.js – in jede App
   als lib/tw-version.js kopieren, nicht abwandeln):
     <meta name="tw-version" content="1.4.0">          ← einzige Stelle der Versionsnummer
     <script defer src="lib/tw-version.js"></script>
   Optional:
     <span data-tw-version></span>   → Versions-Pille dort statt unten links schwebend
     window.twVorAktualisieren = async () => { …offene Eingaben speichern… };
     TWVersion.sprache('pl')         → Sprache (de en cs sk pl ro uk), sonst <html lang>
   Prüfung: lädt die eigene Startseite ohne Cache (alle 5 Min. und beim
   Zurückkehren in die App) und vergleicht <meta name="tw-version">.
   Keine fremden Dienste, keine Daten, läuft offline still weiter.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.TWVersion) return;
  var T = {
    de: { v: 'Version', neu: 'Neue Version {v} – jetzt aktualisieren', laeuft: 'Wird aktualisiert …', titel: 'Neue Fassung laden – deine Eingaben werden vorher gesichert' },
    en: { v: 'Version', neu: 'New version {v} – update now', laeuft: 'Updating …', titel: 'Load the new version – your entries are saved first' },
    cs: { v: 'Verze', neu: 'Nová verze {v} – aktualizovat', laeuft: 'Aktualizuje se …', titel: 'Načíst novou verzi – vaše údaje se nejdřív uloží' },
    sk: { v: 'Verzia', neu: 'Nová verzia {v} – aktualizovať', laeuft: 'Aktualizuje sa …', titel: 'Načítať novú verziu – vaše údaje sa najprv uložia' },
    pl: { v: 'Wersja', neu: 'Nowa wersja {v} – zaktualizuj', laeuft: 'Aktualizacja …', titel: 'Wczytaj nową wersję – Twoje dane zostaną najpierw zapisane' },
    ro: { v: 'Versiunea', neu: 'Versiune nouă {v} – actualizează', laeuft: 'Se actualizează …', titel: 'Încarcă versiunea nouă – datele tale se salvează întâi' },
    uk: { v: 'Версія', neu: 'Нова версія {v} – оновити', laeuft: 'Оновлення …', titel: 'Завантажити нову версію – ваші дані спершу збережуться' }
  };
  var spr = null, neu = null, busy = false, pille = null, balken = null;
  function meta(doc) { var m = (doc || document).querySelector('meta[name="tw-version"]'); return m ? String(m.getAttribute('content') || '').trim() : ''; }
  var ich = meta();
  function sprache() {
    var s = spr || window.TW_SPRACHE || document.documentElement.getAttribute('lang') || navigator.language || 'de';
    s = String(s).slice(0, 2).toLowerCase(); if (s === 'ua') s = 'uk';
    return T[s] ? s : 'de';
  }
  function t(k, v) { return T[sprache()][k].replace('{v}', v || ''); }

  function stil() {
    if (document.getElementById('tw-version-stil')) return;
    var s = document.createElement('style'); s.id = 'tw-version-stil';
    s.textContent =
      '.twv-pille{display:inline-flex;align-items:center;gap:6px;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:5px 10px;border-radius:999px;border:1px solid rgba(127,142,161,.45);background:rgba(26,42,60,.9);color:#E8ECF1;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.twv-schwebe{position:fixed;left:10px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:900;opacity:.75;pointer-events:none}' +
      '.twv-balken{position:fixed;left:50%;transform:translateX(-50%);width:max-content;box-sizing:border-box;top:calc(10px + env(safe-area-inset-top));z-index:2147483000;display:flex;align-items:center;gap:10px;max-width:calc(100% - 24px);padding:10px 16px;min-height:48px;border-radius:14px;border:1px solid #4DA6FF;background:#13314F;color:#fff;font:600 15px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer;animation:twv-ein .3s ease-out}' +
      '.twv-balken:disabled{opacity:.8;cursor:progress}' +
      '.twv-balken svg{flex:none}' +
      '@keyframes twv-ein{from{transform:translate(-50%,-140%)}to{transform:translateX(-50%)}}' +
      '@media (prefers-reduced-motion:reduce){.twv-balken{animation:none}}' +
      '@media print{.twv-pille,.twv-balken{display:none!important}}';
    document.head.appendChild(s);
  }
  var SYM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';

  function zeichnen() {
    if (!ich || !document.body) return;
    stil();
    var ziele = document.querySelectorAll('[data-tw-version]');
    var text = t('v') + ' ' + ich;
    if (ziele.length) {
      if (pille && pille.classList.contains('twv-schwebe')) { pille.remove(); pille = null; }
      ziele.forEach(function (z) { z.classList.add('twv-pille'); z.textContent = text; z.title = text; });
    } else {
      if (!pille) { pille = document.createElement('span'); pille.className = 'twv-pille twv-schwebe'; pille.setAttribute('aria-label', text); document.body.appendChild(pille); }
      pille.textContent = text;
    }
    if (neu && neu !== ich) {
      if (!balken) {
        balken = document.createElement('button'); balken.type = 'button'; balken.className = 'twv-balken';
        balken.addEventListener('click', aktualisieren);
        document.body.appendChild(balken);
      }
      balken.disabled = busy; balken.title = t('titel');
      balken.innerHTML = SYM + '<span></span>'; balken.lastChild.textContent = busy ? t('laeuft') : t('neu', neu);
    } else if (balken) { balken.remove(); balken = null; }
  }

  async function pruefen() {
    if (!ich || busy || navigator.onLine === false) return;
    try {
      var url = location.pathname + (location.pathname.indexOf('?') >= 0 ? '&' : '?') + 'twv=' + Date.now();
      var r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      var html = await r.text();
      var m = html.match(/<meta[^>]+name=["']tw-version["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']tw-version["']/i);
      var v = m ? m[1].trim() : '';
      var vorher = neu; neu = v && v !== ich ? v : null;
      if (neu !== vorher) zeichnen();
    } catch (e) { /* offline – still */ }
  }

  async function aktualisieren() {
    if (busy) return; busy = true; zeichnen();
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { }
    try { if (typeof window.twVorAktualisieren === 'function') await Promise.race([window.twVorAktualisieren(), new Promise(function (r) { setTimeout(r, 10000); })]); } catch (e) { }
    try {
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.update().catch(function () { }); }));
      }
    } catch (e) { }
    location.reload();
  }

  window.TWVersion = {
    version: function () { return ich; },
    neueVersion: function () { return neu; },
    pruefen: pruefen, aktualisieren: aktualisieren,
    sprache: function (s) { spr = s; zeichnen(); },
    zeichnen: zeichnen
  };
  function los() {
    zeichnen();
    // spätere Kopfzeilen (React & Co.) mit data-tw-version ebenfalls befüllen
    try { new MutationObserver(function () { var z = document.querySelector('[data-tw-version]:not(.twv-pille)'); if (z) zeichnen(); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
    setTimeout(pruefen, 5000);
    setInterval(pruefen, 5 * 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pruefen(); });
    window.addEventListener('online', pruefen);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los); else los();
})();
