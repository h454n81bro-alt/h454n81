import { describe, expect, it } from "@jest/globals";
import {
  cacheTraceAttributes,
  datadogPropagationEnvironment,
  firstPartyTraceTargets,
  traceBrowserCacheOperation,
  type SentryLike,
  type SafeCacheTraceAttributes,
} from "./cache-distributed-tracing";

const attributes: SafeCacheTraceAttributes = {
  "cache.operation": "cache.indexeddb.write",
  "cache.mode": "indexeddb",
  "cache.schema_version": 3,
  "cache.chunk_pages": 12,
  "cache.outcome": "ok",
};

describe("cache distributed tracing", () => {
  it("meneruskan atribut cache aman secara utuh", () => {
    expect(cacheTraceAttributes(attributes)).toEqual(attributes);
  });

  it("membuat span dengan operasi dan atribut cache yang konsisten", () => {
    const received: Array<{ name: string; op: string; attributes: SafeCacheTraceAttributes }> = [];
    const sentry: SentryLike = {
      startSpan: (options, callback) => {
        received.push(options);
        return callback();
      },
    };
    const result = traceBrowserCacheOperation(sentry, "cache.indexeddb.write", attributes, () => "selesai");

    expect(result).toBe("selesai");
    expect(received).toEqual([{ name: "cache.indexeddb.write", op: "cache.indexeddb.write", attributes }]);
  });

  it("membatasi target propagasi ke API first-party dan menyediakan konfigurasi Datadog", () => {
    expect(firstPartyTraceTargets.some(target => target.test("/api/trpc/documents.translate"))).toBe(true);
    expect(firstPartyTraceTargets.some(target => target.test("https://telemetry.example/collect"))).toBe(false);
    expect(datadogPropagationEnvironment.DD_TRACE_PROPAGATION_STYLE_INJECT).toBe("tracecontext,baggage");
  });
});
