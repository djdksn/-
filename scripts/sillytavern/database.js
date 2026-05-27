/**
 * IndexedDB Database Layer — zero-dependency.
 * Replaces Dexie CDN with a minimal native IndexedDB wrapper.
 */
const DB_NAME = 'SillyTavernWebDB';
const DB_VERSION = 6;
const STORES = ['lorebooks', 'presets', 'settings', 'chats', 'regex_scripts'];

class MiniDB {
  constructor(name, version) {
    this._name = name;
    this._version = version;
    this._db = null;
  }

  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._name, this._version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            const s = db.createObjectStore(store, { keyPath: 'id' });
            s.createIndex('name', 'name', { unique: false });
            s.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
        // v3 upgrades: ensure settings store has keyPath 'id'
        if (e.oldVersion < 3) {
          // handled by creating stores fresh
        }
        // v4 upgrades: scripts + templates tables
        if (e.oldVersion < 4) {
          // handled by STORES array iteration above
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = (e) => {
        reject(new Error(`IndexedDB open failed: ${e.target.error?.message}`));
      };
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  table(name) {
    return new TableHelper(this, name);
  }

  async delete() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this._name);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(new Error(`Delete failed: ${e.target.error?.message}`));
    });
  }

  async transaction(mode, ...stores) {
    const db = await this._open();
    const tx = db.transaction(stores.map(s => s._name || s), mode);
    return tx;
  }
}

class TableHelper {
  constructor(db, name) {
    this._db = db;
    this._name = name;
  }

  _store(mode) {
    return this._db._open().then(database => {
      const tx = database.transaction(this._name, mode);
      return tx.objectStore(this._name);
    });
  }

  async put(item) {
    const store = await this._store('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async get(id) {
    const store = await this._store('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async delete(id) {
    const store = await this._store('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async count() {
    const store = await this._store('readonly');
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async clear() {
    const store = await this._store('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async toArray() {
    const store = await this._store('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async bulkPut(items) {
    if (!items || items.length === 0) return;
    const store = await this._store('readwrite');
    return new Promise((resolve, reject) => {
      let count = 0;
      let error = null;
      for (const item of items) {
        const req = store.put(item);
        req.onsuccess = () => { count++; if (count === items.length) resolve(); };
        req.onerror = (e) => { error = e.target.error; };
      }
    });
  }
}

let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) dbInstance = new MiniDB(DB_NAME, DB_VERSION);
  return dbInstance;
}

export async function initializeDatabase() {
  const db = getDatabase();

  const presetCount = await db.table('presets').count();
  if (presetCount === 0) {
    const { createDefaultPreset } = await import('./types.js');
    const base = createDefaultPreset();
    await db.table('presets').put({
      ...base, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  const settingsCount = await db.table('settings').count();
  if (settingsCount === 0) {
    const { DEFAULT_SETTINGS } = await import('./types.js');
    await db.table('settings').put({ ...DEFAULT_SETTINGS, id: 'settings' });
  }
}

export async function clearAllData() {
  const db = getDatabase();
  await db.delete();
  dbInstance = null;
}

export async function exportAllData() {
  const db = getDatabase();
  const [lorebooks, presets, settings, chats, regexScripts] = await Promise.all([
    db.table('lorebooks').toArray(),
    db.table('presets').toArray(),
    db.table('settings').toArray(),
    db.table('chats').toArray(),
    db.table('regex_scripts').toArray(),
  ]);
  return { version: DB_VERSION, exportedAt: Date.now(), lorebooks, presets, settings, chats, regexScripts };
}

export async function importAllData(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('备份格式无效');
  const db = getDatabase();
  await db.table('lorebooks').clear();
  await db.table('presets').clear();
  await db.table('settings').clear();
  await db.table('chats').clear();
  await db.table('regex_scripts').clear();
  if (Array.isArray(backup.lorebooks)) await db.table('lorebooks').bulkPut(backup.lorebooks);
  if (Array.isArray(backup.presets)) await db.table('presets').bulkPut(backup.presets);
  if (Array.isArray(backup.settings)) await db.table('settings').bulkPut(backup.settings);
  if (Array.isArray(backup.chats)) await db.table('chats').bulkPut(backup.chats);
  if (Array.isArray(backup.regexScripts)) await db.table('regex_scripts').bulkPut(backup.regexScripts);
}

export async function getLorebooks() { return getDatabase().table('lorebooks').toArray(); }
export async function saveLorebook(lorebook) {
  lorebook.updatedAt = Date.now();
  await getDatabase().table('lorebooks').put(lorebook);
  return lorebook.id;
}
export async function deleteLorebook(id) { await getDatabase().table('lorebooks').delete(id); }

export async function getPresets() { return getDatabase().table('presets').toArray(); }
export async function savePreset(preset) {
  preset.updatedAt = Date.now();
  await getDatabase().table('presets').put(preset);
  return preset.id;
}
export async function deletePreset(id) { await getDatabase().table('presets').delete(id); }

export async function getSettings() {
  const all = await getDatabase().table('settings').toArray();
  return all[0];
}
export async function saveSettings(settings) {
  await getDatabase().table('settings').put({ ...settings, id: 'settings' });
}

export async function getRegexScripts() { return getDatabase().table('regex_scripts').toArray(); }
export async function saveRegexScript(script) {
  script.updatedAt = Date.now();
  await getDatabase().table('regex_scripts').put(script);
  return script.id;
}
export async function deleteRegexScript(id) { await getDatabase().table('regex_scripts').delete(id); }
export async function saveAllRegexScripts(scripts) {
  await getDatabase().table('regex_scripts').clear();
  if (scripts.length > 0) await getDatabase().table('regex_scripts').bulkPut(scripts);
}

export async function getChats() { return getDatabase().table('chats').toArray(); }
export async function saveChat(chat) {
  chat.updatedAt = Date.now();
  await getDatabase().table('chats').put(chat);
  return chat.id;
}
export async function deleteChat(id) { await getDatabase().table('chats').delete(id); }

