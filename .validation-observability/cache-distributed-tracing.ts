/**
 * Minimal, vendor-neutral conventions for cache tracing.
 * Only attributes from this module may be sent to Sentry/Datadog.
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

export function cacheTraceAttributes(input: SafeCacheTraceAttributes) {
  // Intentionally no user/document IDs, filenames, source text, or payload bytes.
  return input;
}

type SentryLike = {
  startSpan<T>(options: { name: string; op: string; attributes: SafeCacheTraceAttributes }, callback: () => T): T;
};

/** Wrap browser-only work in a Sentry span. */
export function traceBrowserCacheOperation<T>(
  sentry: SentryLike,
  operation: CacheTraceOperation,
  attributes: SafeCacheTraceAttributes,
  action: () => T
) {
  return sentry.startSpan({ name: operation, op: operation, attributes: cacheTraceAttributes(attributes) }, action);
}

/**
 * Headers permitted only on first-party API requests. Do not add Sentry
 * trace/baggage headers to arbitrary URLs; configure CORS and allowlists.
 */
export const firstPartyTraceTargets = [/^\/api\//, "https://api.example.com"];

export const datadogPropagationEnvironment = {
  DD_TRACE_PROPAGATION_STYLE_EXTRACT: "tracecontext,baggage,datadog",
  DD_TRACE_PROPAGATION_STYLE_INJECT: "tracecontext,baggage",
};
