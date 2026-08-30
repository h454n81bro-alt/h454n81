import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  createMigrationReporter,
  openLayoutCacheWithFallback,
} from "./indexeddb-migration-resilience";

const database = { close: jest.fn() } as unknown as IDBDatabase;

describe("openLayoutCacheWithFallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mencatat kegagalan total dan mengembalikan fallback rebuild-needed", async () => {
    const reporter = createMigrationReporter();
    const result = await openLayoutCacheWithFallback({
      reporter,
      openAttempt: async () => {
        throw new Error("Payload codec lama tidak dapat dibaca");
      },
    });

    expect(result.mode).toBe("rebuild-needed");
    expect(reporter.recent().map(event => event.code)).toEqual([
      "MIGRATION_STARTED",
      "MIGRATION_FAILED",
      "FALLBACK_REBUILD",
    ]);
    expect(reporter.recent()[1]).toMatchObject({ errorName: "Error" });
  });

  it("mencatat blocked/timeout lalu beralih ke memory-only", async () => {
    const reporter = createMigrationReporter();
    const result = await openLayoutCacheWithFallback({
      reporter,
      timeoutMs: 5,
      openAttempt: async handlers => {
        handlers.onBlocked();
        return new Promise<IDBDatabase>(() => undefined);
      },
    });

    expect(result.mode).toBe("memory-only");
    expect(reporter.recent().map(event => event.code)).toEqual([
      "MIGRATION_STARTED",
      "MIGRATION_BLOCKED",
      "MIGRATION_TIMEOUT",
      "FALLBACK_MEMORY",
    ]);
  });

  it("membersihkan cache turunan sekali lalu mencoba ulang ketika quota penuh", async () => {
    const reporter = createMigrationReporter();
    const cleanup = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const openAttempt = jest
      .fn<(handlers: { onBlocked: () => void; onVersionChange: () => void }) => Promise<IDBDatabase>>()
      .mockRejectedValueOnce(new DOMException("Quota penuh", "QuotaExceededError"))
      .mockResolvedValueOnce(database);

    const result = await openLayoutCacheWithFallback({ reporter, cleanup, openAttempt });

    expect(result).toEqual({ mode: "indexeddb", db: database });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(openAttempt).toHaveBeenCalledTimes(2);
    expect(reporter.recent().map(event => event.code)).toEqual([
      "MIGRATION_STARTED",
      "QUOTA_RECOVERY",
      "MIGRATION_STARTED",
    ]);
  });

  it("membatasi buffer diagnostic dan tidak memerlukan endpoint untuk pencatatan lokal", () => {
    const reporter = createMigrationReporter({ maxEvents: 2 });
    reporter.record({ code: "MIGRATION_STARTED", severity: "info" });
    reporter.record({ code: "MIGRATION_FAILED", severity: "error" });
    reporter.record({ code: "FALLBACK_REBUILD", severity: "warning" });

    expect(reporter.recent().map(event => event.code)).toEqual(["MIGRATION_FAILED", "FALLBACK_REBUILD"]);
  });
});
