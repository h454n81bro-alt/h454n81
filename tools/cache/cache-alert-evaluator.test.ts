import { describe, expect, it } from "@jest/globals";
import { evaluateCacheAlerts, type CacheMetricWindow } from "./cache-alert-evaluator";

const window = (overrides: Partial<CacheMetricWindow> = {}): CacheMetricWindow => ({
  endAt: 1,
  operationCount: 100,
  failedOperationCount: 0,
  p95OperationMs: 200,
  migrationFailureCount: 0,
  memoryOnlyFallbackCount: 0,
  ...overrides,
});

describe("evaluateCacheAlerts", () => {
  it("mengirim critical error-rate hanya setelah melewati ambang selama dua window", () => {
    const alerts = evaluateCacheAlerts([
      window({ endAt: 1, failedOperationCount: 10 }),
      window({ endAt: 2, failedOperationCount: 9 }),
    ]);

    expect(alerts).toContainEqual(expect.objectContaining({ key: "cache_error_rate", severity: "critical", value: 0.09 }));
  });

  it("tidak mengirim alert untuk lonjakan satu window atau volume di bawah minimum", () => {
    expect(evaluateCacheAlerts([window({ failedOperationCount: 30 })])).toEqual([]);
    expect(evaluateCacheAlerts([
      window({ operationCount: 10, failedOperationCount: 10 }),
      window({ endAt: 2, operationCount: 10, failedOperationCount: 10 }),
    ])).toEqual([]);
  });

  it("menahan alert pada lonjakan mendadak satu window lalu mengirim critical bila lonjakan berlanjut", () => {
    const baseline = window({ endAt: 1, failedOperationCount: 1 });
    const firstSpike = window({ endAt: 2, failedOperationCount: 42 });
    const continuedSpike = window({ endAt: 3, failedOperationCount: 38 });

    expect(evaluateCacheAlerts([baseline, firstSpike])).not.toContainEqual(
      expect.objectContaining({ key: "cache_error_rate" })
    );
    expect(evaluateCacheAlerts([baseline, firstSpike, continuedSpike])).toContainEqual(
      expect.objectContaining({ key: "cache_error_rate", severity: "critical", value: 0.38 })
    );
  });

  it("segera menandai migrasi gagal dan fallback memory-only", () => {
    const alerts = evaluateCacheAlerts([window({ migrationFailureCount: 2, memoryOnlyFallbackCount: 3 })]);

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "migration_failure", severity: "critical", value: 2 }),
      expect.objectContaining({ key: "memory_only_fallback", severity: "warning", value: 3 }),
    ]));
  });
});
