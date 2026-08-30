/**
 * Konvensi tracing cache yang aman dan vendor-netral.
 * Jangan tambahkan ID pengguna/dokumen, judul berkas, teks sumber, atau payload.
 */
export type CacheTraceOperation =
  | "cache.layout.plan"
  | "cache.layout.compress"
  | "cache.indexeddb.write"
  | "cache.indexeddb.read"
  | "cache.migration"
  | "cache.cleanup";

export type SafeCacheTraceAttributes = {
  "cache.operation": CacheTraceOperation;
  "cache.mode": "indexeddb" | "memory-only" | "rebuild-needed";
  "cache.schema_version": number;
  "cache.chunk_pages"?: number;
  "cache.outcome"?: "ok" | "error" | "fallback";
};

/** Membatasi atribut agar pemanggil hanya dapat mengirim metadata cache non-sensitif. */
export function cacheTraceAttributes(input: SafeCacheTraceAttributes): SafeCacheTraceAttributes {
  return input;
}

export type SentryLike = {
  startSpan<T>(
    options: { name: string; op: string; attributes: SafeCacheTraceAttributes },
    callback: () => T
  ): T;
};

/** Membungkus kerja cache browser di span Sentry apabila Sentry dipasang pada masa depan. */
export function traceBrowserCacheOperation<T>(
  sentry: SentryLike,
  operation: CacheTraceOperation,
  attributes: SafeCacheTraceAttributes,
  action: () => T
) {
  return sentry.startSpan(
    { name: operation, op: operation, attributes: cacheTraceAttributes(attributes) },
    action
  );
}

/** Hanya rute API first-party yang boleh menerima header trace di masa depan. */
export const firstPartyTraceTargets = [/^\/api\//];

/** Konfigurasi propagasi yang siap dipakai oleh Datadog APM jika dipilih. */
export const datadogPropagationEnvironment = {
  DD_TRACE_PROPAGATION_STYLE_EXTRACT: "tracecontext,baggage,datadog",
  DD_TRACE_PROPAGATION_STYLE_INJECT: "tracecontext,baggage",
} as const;
