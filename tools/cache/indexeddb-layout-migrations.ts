/**
 * Migration example for a regenerable IndexedDB layout cache.
 *
 * Use database version only for IndexedDB schema (stores/indexes). Keep
 * rendererVersion and codecVersion in records for logical cache invalidation.
 */

export const LAYOUT_CACHE_DATABASE = "pustaka-layout-cache";
export const LAYOUT_CACHE_DATABASE_VERSION = 4;

const STORE_CHECKPOINTS = "checkpoints";
const STORE_CHUNKS = "layoutChunks";
const STORE_DOCUMENTS = "documents";
const STORE_META = "meta";

export type OpenLayoutCacheOptions = {
  onBlocked?: () => void;
  onVersionChange?: () => void;
};

function hasIndex(store: IDBObjectStore, indexName: string) {
  return Array.from(store.indexNames).includes(indexName);
}

function ensureVersionOneStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
    const checkpoints = db.createObjectStore(STORE_CHECKPOINTS, { keyPath: "layoutKey" });
    checkpoints.createIndex("byDocument", "documentId", { unique: false });
    checkpoints.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
    const chunks = db.createObjectStore(STORE_CHUNKS, { keyPath: ["layoutKey", "chunkStartPage"] });
    chunks.createIndex("byLayout", "layoutKey", { unique: false });
    chunks.createIndex("byCreatedAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
    db.createObjectStore(STORE_DOCUMENTS, { keyPath: "documentId" });
  }
}

/**
 * A small in-place migration: lastAccessedAt takes its old updatedAt value.
 * Keep work inside the upgrade transaction; do not await promises here.
 */
function addLastAccessedAt(transaction: IDBTransaction) {
  const store = transaction.objectStore(STORE_CHECKPOINTS);
  const cursor = store.openCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current) return;
    const record = current.value as Record<string, unknown>;
    if (typeof record.lastAccessedAt !== "number") {
      current.update({ ...record, lastAccessedAt: record.updatedAt ?? Date.now() });
    }
    current.continue();
  };
}

/**
 * A destructive migration for derived cache data. When serialization or codec
 * changes incompatibly, rebuild layout from the server source rather than risk
 * reading stale coordinates. Never use this policy for user-authored data.
 */
function invalidateDerivedLayoutCache(transaction: IDBTransaction) {
  transaction.objectStore(STORE_CHUNKS).clear();
  transaction.objectStore(STORE_CHECKPOINTS).clear();
  transaction.objectStore(STORE_META).put({
    key: "lastInvalidation",
    at: Date.now(),
    reason: "Layout payload codec changed; cache must be rebuilt.",
  });
}

function migrateSchema(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number) {
  if (oldVersion < 1) ensureVersionOneStores(db);

  if (oldVersion < 2) {
    const chunks = transaction.objectStore(STORE_CHUNKS);
    if (!hasIndex(chunks, "byLayout")) chunks.createIndex("byLayout", "layoutKey", { unique: false });
    if (!hasIndex(chunks, "byCreatedAt")) chunks.createIndex("byCreatedAt", "createdAt", { unique: false });
  }

  if (oldVersion < 3 && !db.objectStoreNames.contains(STORE_META)) {
    db.createObjectStore(STORE_META, { keyPath: "key" });
  }

  // Version 4 switches to a non-compatible compressed layout payload.
  // All data affected here is derived cache, so clearing is safer than a
  // long migration inside the versionchange transaction.
  if (oldVersion < 4) invalidateDerivedLayoutCache(transaction);
}

export function openVersionedLayoutCache(options: OpenLayoutCacheOptions = {}) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opener = indexedDB.open(LAYOUT_CACHE_DATABASE, LAYOUT_CACHE_DATABASE_VERSION);

    opener.onupgradeneeded = event => {
      const transaction = opener.transaction;
      if (!transaction) throw new Error("Transaksi upgrade IndexedDB tidak tersedia.");
      migrateSchema(opener.result, transaction, event.oldVersion);
    };
    opener.onblocked = () => options.onBlocked?.();
    opener.onerror = () => reject(opener.error ?? new Error("Migrasi IndexedDB gagal."));
    opener.onsuccess = () => {
      const db = opener.result;
      db.onversionchange = () => {
        db.close();
        options.onVersionChange?.();
      };
      resolve(db);
    };
  });
}
