import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  LAYOUT_CACHE_DATABASE,
  LAYOUT_CACHE_DATABASE_VERSION,
  openVersionedLayoutCache,
} from "./indexeddb-layout-migrations";

const STORE_CHECKPOINTS = "checkpoints";
const STORE_CHUNKS = "layoutChunks";
const STORE_DOCUMENTS = "documents";
const STORE_META = "meta";

function request<T>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("IndexedDB request gagal"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaksi dibatalkan"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Transaksi gagal"));
  });
}

async function deleteDatabase(name: string) {
  const deletion = indexedDB.deleteDatabase(name);
  await request(deletion);
}

/** Create exactly the historical v1 fixture, not the current schema. */
async function createVersionOneFixture() {
  const opener = indexedDB.open(LAYOUT_CACHE_DATABASE, 1);
  opener.onupgradeneeded = () => {
    const db = opener.result;
    const checkpoints = db.createObjectStore(STORE_CHECKPOINTS, { keyPath: "layoutKey" });
    checkpoints.createIndex("byDocument", "documentId", { unique: false });
    checkpoints.createIndex("byUpdatedAt", "updatedAt", { unique: false });
    const chunks = db.createObjectStore(STORE_CHUNKS, { keyPath: ["layoutKey", "chunkStartPage"] });
    chunks.createIndex("byLayout", "layoutKey", { unique: false });
    chunks.createIndex("byCreatedAt", "createdAt", { unique: false });
    db.createObjectStore(STORE_DOCUMENTS, { keyPath: "documentId" });
  };
  const db = await request(opener);
  try {
    const transaction = db.transaction([STORE_CHECKPOINTS, STORE_CHUNKS], "readwrite");
    transaction.objectStore(STORE_CHECKPOINTS).put({
      layoutKey: "layout-v1",
      documentId: "book-v1",
      documentHash: "old-hash",
      rendererVersion: "renderer-v1",
      nextPage: 13,
      totalPages: 500,
      status: "completed",
      updatedAt: 1_700_000_000_000,
    });
    transaction.objectStore(STORE_CHUNKS).put({
      layoutKey: "layout-v1",
      chunkStartPage: 1,
      chunkEndPage: 12,
      // Payload v1 intentionally does not match the latest compressed format.
      plans: [{ pairId: "legacy-pair", pageStart: 1 }],
      createdAt: 1_700_000_000_000,
    });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

describe("migrasi IndexedDB layout cache v1 → terbaru", () => {
  beforeEach(async () => {
    await deleteDatabase(LAYOUT_CACHE_DATABASE);
  });

  it("meng-upgrade schema, membuat store meta, dan menghapus cache turunan yang tidak kompatibel", async () => {
    await createVersionOneFixture();

    const db = await openVersionedLayoutCache();
    try {
      expect(db.version).toBe(LAYOUT_CACHE_DATABASE_VERSION);
      expect(Array.from(db.objectStoreNames)).toEqual(
        expect.arrayContaining([STORE_CHECKPOINTS, STORE_CHUNKS, STORE_DOCUMENTS, STORE_META])
      );

      const transaction = db.transaction([STORE_CHECKPOINTS, STORE_CHUNKS, STORE_META], "readonly");
      const chunks = transaction.objectStore(STORE_CHUNKS);
      const checkpointCount = request(transaction.objectStore(STORE_CHECKPOINTS).count());
      const chunkCount = request(chunks.count());
      const invalidation = request(
        transaction.objectStore(STORE_META).get("lastInvalidation")
      ) as Promise<{ key: string; reason: string; at: number } | undefined>;

      await expect(checkpointCount).resolves.toBe(0);
      await expect(chunkCount).resolves.toBe(0);
      await expect(invalidation).resolves.toMatchObject({
        key: "lastInvalidation",
        reason: expect.stringContaining("codec changed"),
      });
      expect(Array.from(chunks.indexNames)).toEqual(expect.arrayContaining(["byLayout", "byCreatedAt"]));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });

  it("tidak menjalankan ulang invalidasi ketika database terbaru dibuka kembali", async () => {
    await createVersionOneFixture();
    const first = await openVersionedLayoutCache();
    const firstTransaction = first.transaction(STORE_META, "readonly");
    const firstInvalidation = await request(
      firstTransaction.objectStore(STORE_META).get("lastInvalidation")
    ) as { at: number };
    await transactionDone(firstTransaction);
    first.close();

    const second = await openVersionedLayoutCache();
    try {
      const transaction = second.transaction(STORE_META, "readonly");
      const secondInvalidation = await request(
        transaction.objectStore(STORE_META).get("lastInvalidation")
      ) as { at: number };
      await transactionDone(transaction);
      expect(second.version).toBe(LAYOUT_CACHE_DATABASE_VERSION);
      expect(secondInvalidation.at).toBe(firstInvalidation.at);
    } finally {
      second.close();
    }
  });
});
