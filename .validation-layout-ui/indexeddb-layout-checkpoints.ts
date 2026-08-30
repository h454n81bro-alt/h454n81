/**
 * Checkpoint cache for browser-side layout planning of bilingual PDFs.
 *
 * Store only deterministic layout plans and small preview artifacts. The
 * document/translation database remains the source of truth. Do not store API
 * keys or unencrypted credentials in IndexedDB.
 */

export type Typography = {
  arabicFont: string;
  arabicSizePt: number;
  indonesianFont: string;
  indonesianSizePt: number;
  contentWidthPt: number;
  pageHeightPt: number;
  marginPt: number;
};

export type PairLayoutPlan = {
  pairId: string;
  pageStart: number;
  fragments: Array<{
    page: number;
    arabicLineRange: [number, number];
    indonesianLineRange: [number, number];
    yStart: number;
    height: number;
    continuation: boolean;
  }>;
  footnotePlacement: "inline" | "next-page" | "page-notes";
};

export type LayoutChunk = {
  layoutKey: string;
  chunkStartPage: number;
  chunkEndPage: number;
  plans: PairLayoutPlan[];
  createdAt: number;
};

export type LayoutCheckpoint = {
  layoutKey: string;
  documentId: string;
  documentHash: string;
  rendererVersion: string;
  nextPage: number;
  totalPages: number;
  status: "running" | "completed" | "failed";
  updatedAt: number;
  error?: string;
};

const DATABASE_NAME = "pustaka-layout-cache";
const DATABASE_VERSION = 2;
const STORE_CHECKPOINTS = "checkpoints";
const STORE_CHUNKS = "layoutChunks";
const STORE_DOCUMENTS = "documents";

function request<T>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function openLayoutCache() {
  return openLayoutCacheWithSchema();
}

function openLayoutCacheWithSchema() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opener = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    opener.onupgradeneeded = () => {
      const db = opener.result;
      if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
        const store = db.createObjectStore(STORE_CHECKPOINTS, { keyPath: "layoutKey" });
        store.createIndex("byDocument", "documentId", { unique: false });
        store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, { keyPath: ["layoutKey", "chunkStartPage"] });
        store.createIndex("byLayout", "layoutKey", { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS, { keyPath: "documentId" });
      }
    };
    opener.onsuccess = () => resolve(opener.result);
    opener.onerror = () => reject(opener.error ?? new Error("Could not open layout cache"));
  });
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildLayoutKey(input: {
  documentHash: string;
  translationRevision: string;
  typography: Typography;
  pageFormat: "A4" | "LETTER";
  rendererVersion: string;
}): Promise<string> {
  // Any layout-affecting change creates a different key and therefore cannot
  // reuse stale line wraps or page positions.
  return sha256(stableStringify(input));
}

export async function saveChunkAndCheckpoint(chunk: LayoutChunk, checkpoint: LayoutCheckpoint) {
  const db = await openLayoutCacheWithSchema();
  try {
    const transaction = db.transaction([STORE_CHUNKS, STORE_CHECKPOINTS], "readwrite");
    transaction.objectStore(STORE_CHUNKS).put(chunk);
    transaction.objectStore(STORE_CHECKPOINTS).put(checkpoint);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function loadResumableLayout(layoutKey: string) {
  const db = await openLayoutCacheWithSchema();
  try {
    const transaction = db.transaction([STORE_CHECKPOINTS, STORE_CHUNKS], "readonly");
    const checkpointRequest = transaction.objectStore(STORE_CHECKPOINTS).get(layoutKey);
    const chunkRequest = transaction
      .objectStore(STORE_CHUNKS)
      .index("byLayout")
      .getAll(IDBKeyRange.only(layoutKey));
    const [checkpoint, chunks] = await Promise.all([
      request(checkpointRequest) as Promise<LayoutCheckpoint | undefined>,
      request(chunkRequest) as Promise<LayoutChunk[]>,
    ]);
    await transactionDone(transaction);
    return { checkpoint, chunks: chunks.sort((left, right) => left.chunkStartPage - right.chunkStartPage) };
  } finally {
    db.close();
  }
}

export async function markLayoutCompleted(layoutKey: string) {
  const { checkpoint } = await loadResumableLayout(layoutKey);
  if (!checkpoint) return;
  await saveCheckpoint({ ...checkpoint, status: "completed", nextPage: checkpoint.totalPages + 1, updatedAt: Date.now() });
}

export async function saveCheckpoint(checkpoint: LayoutCheckpoint) {
  const db = await openLayoutCacheWithSchema();
  try {
    const transaction = db.transaction(STORE_CHECKPOINTS, "readwrite");
    transaction.objectStore(STORE_CHECKPOINTS).put(checkpoint);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteLayout(layoutKey: string) {
  const db = await openLayoutCacheWithSchema();
  try {
    const transaction = db.transaction([STORE_CHUNKS, STORE_CHECKPOINTS], "readwrite");
    const chunks = transaction.objectStore(STORE_CHUNKS);
    const index = chunks.index("byLayout");
    const range = IDBKeyRange.only(layoutKey);
    const cursor = index.openKeyCursor(range);
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      chunks.delete(current.primaryKey);
      current.continue();
    };
    transaction.objectStore(STORE_CHECKPOINTS).delete(layoutKey);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function storageHealth() {
  const estimate = await navigator.storage?.estimate?.();
  const persistent = await navigator.storage?.persisted?.();
  return {
    usageBytes: estimate?.usage ?? 0,
    quotaBytes: estimate?.quota ?? 0,
    isPersistent: persistent ?? false,
  };
}

export async function requestPersistentStorage() {
  const storage = navigator.storage as StorageManager & { persist?: () => Promise<boolean> };
  if (!storage?.persist) return false;
  return storage.persist();
}

/**
 * Run layout work under a per-document cross-tab lock when supported.
 * If Locks API is unavailable, the caller should still make every chunk write
 * idempotent by using the composite [layoutKey, chunkStartPage] primary key.
 */
export async function withLayoutLock<T>(layoutKey: string, task: () => Promise<T>): Promise<T> {
  if (navigator.locks?.request) return navigator.locks.request(`layout:${layoutKey}`, task);
  return task();
}
