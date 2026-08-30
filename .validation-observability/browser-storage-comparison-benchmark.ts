import LZString = require("lz-string");

export type BenchmarkConfig = {
  pages?: number;
  pairsPerPage?: number;
  trials?: number;
  warmups?: number;
  keepArtifacts?: boolean;
};

export type StorageKind = "localStorage" | "indexedDB" | "cacheAPI";
export type EncodingKind = "raw-json" | "lz-string";

export type StorageBenchmarkSample = {
  storage: StorageKind;
  encoding: EncodingKind;
  status: "ok" | "unsupported" | "error";
  prepareMs?: number;
  writeMs?: number;
  readMs?: number;
  decodeMs?: number;
  endToEndMs?: number;
  storedBytes?: number;
  errorName?: string;
  errorMessage?: string;
};

export type StorageBenchmarkSummary = StorageBenchmarkSample & {
  sampleCount: number;
  medianPrepareMs?: number;
  medianWriteMs?: number;
  medianReadMs?: number;
  medianDecodeMs?: number;
  medianEndToEndMs?: number;
  medianStoredBytes?: number;
};

export type StorageBenchmarkResult = {
  startedAt: string;
  config: Required<Omit<BenchmarkConfig, "keepArtifacts">>;
  payload: { pairs: number; rawUtf8Bytes: number; note: string };
  samples: StorageBenchmarkSample[];
  summaries: StorageBenchmarkSummary[];
};

type SyntheticPair = {
  id: string;
  page: number;
  sourceOrder: number;
  arabicText: string;
  indonesianText: string;
  fragments: Array<{ page: number; yStart: number; height: number; continuation: boolean }>;
  glossaryMatches: Array<{ arabicTerm: string; indonesianTerm: string }>;
};

type SerializedPayload = {
  raw: string;
  rawBytes: number;
  lzText: string;
  lzTextBytes: number;
  lzBinary: Uint8Array;
};

const DB_NAME_PREFIX = "pustaka-storage-benchmark";
const DB_STORE = "records";
const CACHE_NAME_PREFIX = "pustaka-storage-benchmark";

function median(values: number[]) {
  if (!values.length) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[midpoint] : (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
}

function bytes(value: string | Uint8Array) {
  return typeof value === "string" ? new TextEncoder().encode(value).byteLength : value.byteLength;
}

function now() {
  return performance.now();
}

function createSyntheticLayout(pages: number, pairsPerPage: number): SyntheticPair[] {
  const pairs: SyntheticPair[] = [];
  const arabicBase = "قال المؤلف إن حفظ ترتيب الفقرات العربية وترجمتها يحتاج إلى قياس دقيق لتخطيط الصفحة.";
  const indonesianBase = "Penulis menjelaskan bahwa menjaga urutan paragraf Arab dan terjemahannya memerlukan pengukuran tata letak halaman yang cermat agar pengalaman membaca tetap konsisten.";
  for (let page = 1; page <= pages; page += 1) {
    for (let position = 0; position < pairsPerPage; position += 1) {
      pairs.push({
        id: `page-${page}-pair-${position}`,
        page,
        sourceOrder: (page - 1) * pairsPerPage + position,
        arabicText: `${arabicBase} ${arabicBase}`,
        indonesianText: `${indonesianBase} ${indonesianBase}`,
        fragments: [{ page, yStart: 48 + position * 106, height: 97, continuation: false }],
        glossaryMatches: position % 4 === 0 ? [{ arabicTerm: "ترجمة", indonesianTerm: "terjemahan" }] : [],
      });
    }
  }
  return pairs;
}

function serializePayload(payload: SyntheticPair[]): SerializedPayload {
  const raw = JSON.stringify({ format: "layout-benchmark-v1", pairs: payload });
  const lzText = LZString.compressToUTF16(raw);
  const lzBinary = LZString.compressToUint8Array(raw);
  return { raw, rawBytes: bytes(raw), lzText, lzTextBytes: bytes(lzText), lzBinary };
}

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

function openBenchmarkDb(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opener = indexedDB.open(name, 1);
    opener.onupgradeneeded = () => {
      if (!opener.result.objectStoreNames.contains(DB_STORE)) opener.result.createObjectStore(DB_STORE);
    };
    opener.onsuccess = () => resolve(opener.result);
    opener.onerror = () => reject(opener.error ?? new Error("Cannot open benchmark IndexedDB"));
  });
}

async function deleteBenchmarkDb(name: string) {
  const deletion = indexedDB.deleteDatabase(name);
  await request(deletion);
}

async function benchmarkLocalStorage(
  encoding: EncodingKind,
  key: string,
  payload: SerializedPayload
): Promise<StorageBenchmarkSample> {
  const prepareStarted = now();
  const value = encoding === "raw-json" ? payload.raw : payload.lzText;
  const prepareMs = now() - prepareStarted;
  const writeStarted = now();
  localStorage.setItem(key, value);
  const writeMs = now() - writeStarted;
  const readStarted = now();
  const stored = localStorage.getItem(key);
  const readMs = now() - readStarted;
  if (stored === null) throw new Error("LocalStorage benchmark tidak menemukan record.");
  const decodeStarted = now();
  const decoded = encoding === "raw-json" ? stored : LZString.decompressFromUTF16(stored);
  if (decoded === null) throw new Error("Payload LocalStorage tidak dapat didekompresi.");
  JSON.parse(decoded);
  const decodeMs = now() - decodeStarted;
  localStorage.removeItem(key);
  return { storage: "localStorage", encoding, status: "ok", prepareMs, writeMs, readMs, decodeMs, endToEndMs: prepareMs + writeMs + readMs + decodeMs, storedBytes: bytes(value) };
}

async function benchmarkIndexedDb(
  encoding: EncodingKind,
  databaseName: string,
  payload: SerializedPayload
): Promise<StorageBenchmarkSample> {
  const prepareStarted = now();
  const value = encoding === "raw-json" ? payload.raw : payload.lzBinary;
  const prepareMs = now() - prepareStarted;
  const db = await openBenchmarkDb(databaseName);
  try {
    const writeStarted = now();
    const writeTransaction = db.transaction(DB_STORE, "readwrite");
    writeTransaction.objectStore(DB_STORE).put(value, "payload");
    await transactionDone(writeTransaction);
    const writeMs = now() - writeStarted;
    const readStarted = now();
    const readTransaction = db.transaction(DB_STORE, "readonly");
    const stored = await request(readTransaction.objectStore(DB_STORE).get("payload")) as string | Uint8Array;
    await transactionDone(readTransaction);
    const readMs = now() - readStarted;
    const decodeStarted = now();
    const decoded = encoding === "raw-json" ? stored as string : LZString.decompressFromUint8Array(stored as Uint8Array);
    if (decoded === null) throw new Error("Payload IndexedDB tidak dapat didekompresi.");
    JSON.parse(decoded);
    const decodeMs = now() - decodeStarted;
    return { storage: "indexedDB", encoding, status: "ok", prepareMs, writeMs, readMs, decodeMs, endToEndMs: prepareMs + writeMs + readMs + decodeMs, storedBytes: bytes(value) };
  } finally {
    db.close();
    await deleteBenchmarkDb(databaseName);
  }
}

async function benchmarkCacheApi(
  encoding: EncodingKind,
  cacheName: string,
  requestUrl: string,
  payload: SerializedPayload
): Promise<StorageBenchmarkSample> {
  if (!globalThis.caches) return { storage: "cacheAPI", encoding, status: "unsupported" };
  const prepareStarted = now();
  const isRaw = encoding === "raw-json";
  const body = isRaw ? payload.raw : payload.lzBinary;
  const response = new Response(body, { headers: { "content-type": isRaw ? "application/json" : "application/octet-stream" } });
  const prepareMs = now() - prepareStarted;
  try {
    const cache = await caches.open(cacheName);
    const writeStarted = now();
    await cache.put(requestUrl, response);
    const writeMs = now() - writeStarted;
    const readStarted = now();
    const stored = await cache.match(requestUrl);
    const readMs = now() - readStarted;
    if (!stored) throw new Error("Cache API benchmark tidak menemukan respons.");
    const decodeStarted = now();
    const decoded = isRaw
      ? await stored.text()
      : LZString.decompressFromUint8Array(new Uint8Array(await stored.arrayBuffer()));
    if (decoded === null) throw new Error("Payload Cache API tidak dapat didekompresi.");
    JSON.parse(decoded);
    const decodeMs = now() - decodeStarted;
    return { storage: "cacheAPI", encoding, status: "ok", prepareMs, writeMs, readMs, decodeMs, endToEndMs: prepareMs + writeMs + readMs + decodeMs, storedBytes: bytes(body) };
  } finally {
    await caches.delete(cacheName);
  }
}

function summarize(samples: StorageBenchmarkSample[]): StorageBenchmarkSummary[] {
  const groups = new Map<string, StorageBenchmarkSample[]>();
  for (const sample of samples) {
    const key = `${sample.storage}:${sample.encoding}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.values()].map(group => {
    const first = group[0]!;
    const successful = group.filter(item => item.status === "ok");
    const values = (property: keyof StorageBenchmarkSample) => successful.map(item => item[property]).filter((value): value is number => typeof value === "number");
    return {
      ...first,
      sampleCount: successful.length,
      medianPrepareMs: median(values("prepareMs")),
      medianWriteMs: median(values("writeMs")),
      medianReadMs: median(values("readMs")),
      medianDecodeMs: median(values("decodeMs")),
      medianEndToEndMs: median(values("endToEndMs")),
      medianStoredBytes: median(values("storedBytes")),
    };
  });
}

/**
 * Run only in a real browser/worker on HTTPS or localhost. Browser storage and
 * quotas are device-specific, so the output is comparative—not universal.
 */
export async function runBrowserStorageComparison(config: BenchmarkConfig = {}): Promise<StorageBenchmarkResult> {
  const pages = config.pages ?? 500;
  const pairsPerPage = config.pairsPerPage ?? 6;
  const trials = config.trials ?? 5;
  const warmups = config.warmups ?? 1;
  const runId = crypto.randomUUID();
  const payload = serializePayload(createSyntheticLayout(pages, pairsPerPage));
  const samples: StorageBenchmarkSample[] = [];
  const targets: Array<{ storage: StorageKind; encoding: EncodingKind }> = [
    { storage: "localStorage", encoding: "raw-json" },
    { storage: "localStorage", encoding: "lz-string" },
    { storage: "indexedDB", encoding: "raw-json" },
    { storage: "indexedDB", encoding: "lz-string" },
    { storage: "cacheAPI", encoding: "raw-json" },
    { storage: "cacheAPI", encoding: "lz-string" },
  ];

  const runTarget = async (target: { storage: StorageKind; encoding: EncodingKind }, iteration: number | string) => {
    const key = `${runId}:${target.storage}:${target.encoding}:${iteration}`;
    if (target.storage === "localStorage") return benchmarkLocalStorage(target.encoding, key, payload);
    if (target.storage === "indexedDB") return benchmarkIndexedDb(target.encoding, `${DB_NAME_PREFIX}:${key}`, payload);
    return benchmarkCacheApi(target.encoding, `${CACHE_NAME_PREFIX}:${key}`, `${location.origin}/__cache-layout-benchmark__/${key}`, payload);
  };

  for (const target of targets) {
    for (let warmup = 0; warmup < warmups; warmup += 1) await runTarget(target, `warmup-${warmup}`);
    for (let trial = 0; trial < trials; trial += 1) {
      try {
        samples.push(await runTarget(target, trial));
      } catch (error) {
        samples.push({
          storage: target.storage,
          encoding: target.encoding,
          status: "error",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : "Benchmark storage gagal.",
        });
      }
    }
  }

  return {
    startedAt: new Date().toISOString(),
    config: { pages, pairsPerPage, trials, warmups },
    payload: {
      pairs: pages * pairsPerPage,
      rawUtf8Bytes: payload.rawBytes,
      note: "storedBytes mengukur byte payload aplikasi (UTF-8 atau Uint8Array), bukan penggunaan quota internal browser.",
    },
    samples,
    summaries: summarize(samples),
  };
}

export function downloadBenchmarkJson(result: StorageBenchmarkResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `browser-storage-benchmark-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
