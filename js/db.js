// TW Bildstudio – Speicher im Browser (IndexedDB): Bild-Daten, Originale, Vorschaubilder, Einstellungen
const NAME = 'tw-bildstudio', VERSION = 1;
let dbP = null;
function open() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['recs', 'blobs', 'thumbs', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
    Promise.resolve(fn(s)).then(v => out = v);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const get = (store, key) => tx(store, 'readonly', s => req(s.get(key)));
export const put = (store, key, val) => tx(store, 'readwrite', s => { s.put(val, key); });
export const del = (store, key) => tx(store, 'readwrite', s => { s.delete(key); });
export const alle = (store) => tx(store, 'readonly', s => req(s.getAll()));
export const schluessel = (store) => tx(store, 'readonly', s => req(s.getAllKeys()));
export async function putViele(store, eintraege) { return tx(store, 'readwrite', s => { for (const [k, v] of eintraege) s.put(v, k); }); }
export async function delViele(store, keys) { return tx(store, 'readwrite', s => { for (const k of keys) s.delete(k); }); }
export async function leeren() { for (const s of ['recs', 'blobs', 'thumbs', 'kv']) await tx(s, 'readwrite', st => { st.clear(); }); }
export async function speicherInfo() { try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; } }
export async function dauerhaft() { try { return await navigator.storage.persist(); } catch (e) { return false; } }
