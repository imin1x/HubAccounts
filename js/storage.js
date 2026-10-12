// HubAccounts — Storage shim: IndexedDB with non-destructive localStorage migration.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
/* =====================================================================
   STORAGE SHIM — IndexedDB with a non-destructive localStorage migration.
   Existing `devic3:*` localStorage records are copied once and deliberately
   left in place as a recovery fallback. If IndexedDB is unavailable (private
   browsing / an old embedded browser), the app continues using localStorage.
===================================================================== */
if(!window.storage){
  // LEGACY STORAGE IDENTIFIERS — the app was renamed to HubAccounts, but these
  // key names (and the other `devic3*` storage/sync/backup identifiers
  // below) are kept verbatim: renaming them would orphan every existing vault,
  // session, Drive sync file and backup.
  const LS_PREFIX = 'devic3:';
  const IDB_NAME = 'devic3-vault';
  const IDB_STORE = 'kv';
  const MIGRATION_MARKER = '__localStorageMigratedV1';
  let idbPromise = null;

  function localStorageAdapter(){
    return {
      async get(key, shared){
        const raw = localStorage.getItem(LS_PREFIX + key);
        return raw === null ? null : { key, value: raw, shared: !!shared };
      },
      async set(key, value, shared){
        localStorage.setItem(LS_PREFIX + key, value);
        return { key, value, shared: !!shared };
      },
      async delete(key, shared){
        localStorage.removeItem(LS_PREFIX + key);
        return { key, deleted: true, shared: !!shared };
      },
      async list(prefix, shared){
        const keys = [];
        for(let i = 0; i < localStorage.length; i++){
          const full = localStorage.key(i);
          if(!full || !full.startsWith(LS_PREFIX)) continue;
          const key = full.slice(LS_PREFIX.length);
          if(!prefix || key.startsWith(prefix)) keys.push(key);
        }
        return { keys, prefix, shared: !!shared };
      }
    };
  }
  const localFallback = localStorageAdapter();

  function requestToPromise(request){
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function openIndexedDb(){
    if(idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if(!window.indexedDB){ reject(new Error('IndexedDB is unavailable')); return; }
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      request.onsuccess = async () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        try{
          // Only fill missing keys. Never delete or overwrite the legacy copy.
          const legacy = [];
          for(let i = 0; i < localStorage.length; i++){
            const full = localStorage.key(i);
            if(full && full.startsWith(LS_PREFIX)) legacy.push([full.slice(LS_PREFIX.length), localStorage.getItem(full)]);
          }
          const readTx = db.transaction(IDB_STORE, 'readonly');
          const existingKeys = new Set(await requestToPromise(readTx.objectStore(IDB_STORE).getAllKeys()));
          if(!existingKeys.has(MIGRATION_MARKER)){
            const missing = legacy.filter(([key]) => !existingKeys.has(key));
            const writeTx = db.transaction(IDB_STORE, 'readwrite');
            const store = writeTx.objectStore(IDB_STORE);
            for(const [key, value] of missing) store.put(value, key);
            store.put(String(Date.now()), MIGRATION_MARKER);
            await new Promise((ok, fail) => { writeTx.oncomplete = ok; writeTx.onerror = () => fail(writeTx.error); writeTx.onabort = () => fail(writeTx.error); });
          }
          resolve(db);
        }catch(error){ db.close(); reject(error); }
      };
      request.onerror = () => reject(request.error || new Error('Cannot open IndexedDB'));
    }).catch(error => {
      console.warn('IndexedDB unavailable; using localStorage fallback.', error);
      return null;
    });
    return idbPromise;
  }

  async function withStore(mode, action){
    const db = await openIndexedDb();
    if(!db) return null;
    const tx = db.transaction(IDB_STORE, mode);
    const result = await action(tx.objectStore(IDB_STORE));
    if(mode === 'readwrite'){
      await new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); });
    }
    return result;
  }

  window.storage = {
    async get(key, shared){
      try{
        const db = await openIndexedDb();
        if(!db) return localFallback.get(key, shared);
        const value = await withStore('readonly', store => requestToPromise(store.get(key)));
        return value === undefined ? null : { key, value, shared: !!shared };
      }catch(error){ console.error('storage.get failed', error); throw error; }
    },
    async set(key, value, shared){
      try{
        const db = await openIndexedDb();
        if(!db) return localFallback.set(key, value, shared);
        await withStore('readwrite', store => requestToPromise(store.put(value, key)));
        return { key, value, shared: !!shared };
      }catch(error){ console.error('storage.set failed', error); return null; }
    },
    async delete(key, shared){
      try{
        const db = await openIndexedDb();
        if(!db) return localFallback.delete(key, shared);
        await withStore('readwrite', store => requestToPromise(store.delete(key)));
        return { key, deleted: true, shared: !!shared };
      }catch(error){ console.error('storage.delete failed', error); return null; }
    },
    async list(prefix, shared){
      try{
        const db = await openIndexedDb();
        if(!db) return localFallback.list(prefix, shared);
        const keys = await withStore('readonly', store => requestToPromise(store.getAllKeys()));
        return { keys: keys.filter(key => !prefix || String(key).startsWith(prefix)), prefix, shared: !!shared };
      }catch(error){ console.error('storage.list failed', error); return null; }
    }
  };
}
/* ===================================================================== */

