import LZString from "lz-string";

export type BenchmarkEncoding = "raw-json" | "lz-string";
export type AdapterResult = {
  storage: string;
  encoding: BenchmarkEncoding;
  status: "ok" | "unsupported" | "error";
  writeMs?: number;
  readMs?: number;
  decodeMs?: number;
  endToEndMs?: number;
  storedBytes?: number;
  errorName?: string;
  errorMessage?: string;
};

export type StorageBenchmarkAdapter = {
  name: string;
  isSupported: () => boolean | Promise<boolean>;
  write: (key: string, payload: string) => Promise<void>;
  read: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
};

export type BrowserStorageBenchmarkToolOptions = {
  payload: unknown;
  adapters: StorageBenchmarkAdapter[];
  trials?: number;
  warmups?: number;
  keyPrefix?: string;
  now?: () => number;
};

export type BrowserStorageBenchmarkToolResult = {
  rawUtf8Bytes: number;
  trials: number;
  warmups: number;
  samples: AdapterResult[];
  summaries: Array<
    AdapterResult & {
      sampleCount: number;
      medianWriteMs?: number;
      medianReadMs?: number;
      medianDecodeMs?: number;
      medianEndToEndMs?: number;
      medianStoredBytes?: number;
    }
  >;
};

const encoder = new TextEncoder();

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function bytes(value: string) {
  return encoder.encode(value).byteLength;
}

function encode(serialized: string, encoding: BenchmarkEncoding) {
  return encoding === "raw-json" ? serialized : LZString.compressToUTF16(serialized);
}

function decode(payload: string, encoding: BenchmarkEncoding) {
  const value = encoding === "raw-json" ? payload : LZString.decompressFromUTF16(payload);
  if (value === null) throw new Error("Payload LZ-string tidak dapat didekompresi.");
  return value;
}

function summarize(samples: AdapterResult[]) {
  const groups = new Map<string, AdapterResult[]>();
  for (const sample of samples) {
    const key = `${sample.storage}:${sample.encoding}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }

  return [...groups.values()].map(group => {
    const first = group[0]!;
    const success = group.filter(item => item.status === "ok");
    const values = (key: keyof AdapterResult) =>
      success
        .map(sample => sample[key])
        .filter((value): value is number => typeof value === "number");

    return {
      ...first,
      sampleCount: success.length,
      medianWriteMs: median(values("writeMs")),
      medianReadMs: median(values("readMs")),
      medianDecodeMs: median(values("decodeMs")),
      medianEndToEndMs: median(values("endToEndMs")),
      medianStoredBytes: median(values("storedBytes")),
    };
  });
}

/** Mengukur adapter dengan JSON mentah dan LZ-string, lalu membersihkan setiap key. */
export async function runBrowserStorageBenchmarkTool(
  input: BrowserStorageBenchmarkToolOptions
): Promise<BrowserStorageBenchmarkToolResult> {
  const serialized = JSON.stringify(input.payload);
  const trials = input.trials ?? 5;
  const warmups = input.warmups ?? 1;
  const keyPrefix = input.keyPrefix ?? `storage-benchmark:${crypto.randomUUID()}`;
  const now = input.now ?? performance.now.bind(performance);
  const samples: AdapterResult[] = [];

  for (const adapter of input.adapters) {
    const supported = await adapter.isSupported();
    for (const encoding of ["raw-json", "lz-string"] as const) {
      if (!supported) {
        samples.push({ storage: adapter.name, encoding, status: "unsupported" });
        continue;
      }

      const payload = encode(serialized, encoding);
      const execute = async (key: string): Promise<AdapterResult> => {
        const writeStarted = now();
        await adapter.write(key, payload);
        const writeMs = now() - writeStarted;
        const readStarted = now();
        const stored = await adapter.read(key);
        const readMs = now() - readStarted;
        if (stored === null) throw new Error(`${adapter.name} tidak mengembalikan payload benchmark.`);
        const decodeStarted = now();
        JSON.parse(decode(stored, encoding));
        const decodeMs = now() - decodeStarted;
        return {
          storage: adapter.name,
          encoding,
          status: "ok",
          writeMs,
          readMs,
          decodeMs,
          endToEndMs: writeMs + readMs + decodeMs,
          storedBytes: bytes(payload),
        };
      };

      for (let warmup = 0; warmup < warmups; warmup += 1) {
        const key = `${keyPrefix}:${adapter.name}:${encoding}:warmup:${warmup}`;
        try {
          await execute(key);
        } finally {
          await adapter.remove(key);
        }
      }

      for (let trial = 0; trial < trials; trial += 1) {
        const key = `${keyPrefix}:${adapter.name}:${encoding}:trial:${trial}`;
        try {
          samples.push(await execute(key));
        } catch (error) {
          samples.push({
            storage: adapter.name,
            encoding,
            status: "error",
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : "Benchmark gagal.",
          });
        } finally {
          await adapter.remove(key);
        }
      }
    }
  }

  return {
    rawUtf8Bytes: bytes(serialized),
    trials,
    warmups,
    samples,
    summaries: summarize(samples),
  };
}

export function createLocalStorageAdapter(storage: Storage = localStorage): StorageBenchmarkAdapter {
  return {
    name: "localStorage",
    isSupported: () => typeof storage !== "undefined",
    write: async (key, value) => storage.setItem(key, value),
    read: async key => storage.getItem(key),
    remove: async key => storage.removeItem(key),
  };
}

export function createCacheApiAdapter(cacheName = "pustaka-layout-benchmark"): StorageBenchmarkAdapter {
  return {
    name: "cacheAPI",
    isSupported: () => Boolean(globalThis.caches && globalThis.location?.protocol !== "file:"),
    write: async (key, value) => {
      const cache = await caches.open(cacheName);
      await cache.put(key, new Response(value, { headers: { "content-type": "text/plain;charset=utf-8" } }));
    },
    read: async key => {
      const cache = await caches.open(cacheName);
      const response = await cache.match(key);
      return response ? response.text() : null;
    },
    remove: async key => {
      const cache = await caches.open(cacheName);
      await cache.delete(key);
    },
  };
}

export function createMemoryAdapter(name = "memory"): StorageBenchmarkAdapter {
  const values = new Map<string, string>();
  return {
    name,
    isSupported: () => true,
    write: async (key, value) => { values.set(key, value); },
    read: async key => values.get(key) ?? null,
    remove: async key => { values.delete(key); },
  };
}
