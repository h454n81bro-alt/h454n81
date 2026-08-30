export type MigrationSeverity = "info" | "warning" | "error";

export type MigrationLogEvent = {
  at: number;
  severity: MigrationSeverity;
  code:
    | "MIGRATION_STARTED"
    | "MIGRATION_BLOCKED"
    | "MIGRATION_TIMEOUT"
    | "MIGRATION_FAILED"
    | "QUOTA_RECOVERY"
    | "FALLBACK_REBUILD"
    | "FALLBACK_MEMORY";
  databaseVersion?: number;
  fromVersion?: number;
  errorName?: string;
  errorMessage?: string;
  attempt?: number;
  metadata?: Record<string, string | number | boolean>;
};

export type MigrationReporter = {
  record: (event: Omit<MigrationLogEvent, "at">) => void;
  flush: () => Promise<void>;
  recent: () => MigrationLogEvent[];
};

export function createMigrationReporter(options: { endpoint?: string; maxEvents?: number } = {}): MigrationReporter {
  const events: MigrationLogEvent[] = [];
  const maxEvents = options.maxEvents ?? 40;

  const recent = () => [...events];
  const flush = async () => {
    if (!options.endpoint || events.length === 0) return;
    const body = JSON.stringify({ events: recent() });
    // Beacon is deliberately used only for a small, sanitized diagnostic log.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const queued = navigator.sendBeacon(options.endpoint, new Blob([body], { type: "application/json" }));
      if (queued) return;
    }
    if (typeof fetch !== "undefined") {
      await fetch(options.endpoint, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      });
    }
  };

  return {
    record(event) {
      // Do not include Arabic source text, translations, file names, API keys,
      // raw IndexedDB records, or user identity in diagnostics.
      events.push({ ...event, at: Date.now() });
      if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    },
    flush,
    recent,
  };
}

export type CacheOpenResult =
  | { mode: "indexeddb"; db: IDBDatabase }
  | { mode: "rebuild-needed"; reason: string }
  | { mode: "memory-only"; reason: string };

type OpenAttempt = (handlers: {
  onBlocked: () => void;
  onVersionChange: () => void;
}) => Promise<IDBDatabase>;

const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function describeError(error: unknown) {
  const errorName = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message.slice(0, 240) : "Migrasi cache gagal tanpa detail error.";
  return { errorName, errorMessage };
}

function isQuotaError(error: unknown) {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "UnknownError");
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DOMException("Pembukaan IndexedDB melebihi batas waktu.", "TimeoutError")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Open a cache without treating any local-cache failure as a document failure.
 * `cleanup` must remove only regenerable caches; it is attempted once for quota.
 */
export async function openLayoutCacheWithFallback(input: {
  openAttempt: OpenAttempt;
  reporter: MigrationReporter;
  cleanup?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<CacheOpenResult> {
  const timeoutMs = input.timeoutMs ?? 12_000;
  let blocked = false;

  const attempt = async (attemptNumber: number) => {
    input.reporter.record({ code: "MIGRATION_STARTED", severity: "info", attempt: attemptNumber });
    return withTimeout(
      input.openAttempt({
        onBlocked: () => {
          blocked = true;
          input.reporter.record({ code: "MIGRATION_BLOCKED", severity: "warning", attempt: attemptNumber });
        },
        onVersionChange: () => input.reporter.record({ code: "MIGRATION_BLOCKED", severity: "warning", metadata: { cause: "versionchange" } }),
      }),
      timeoutMs
    );
  };

  try {
    const db = await attempt(1);
    return { mode: "indexeddb", db };
  } catch (error) {
    const details = describeError(error);
    if (details.errorName === "TimeoutError" || blocked) {
      input.reporter.record({ code: "MIGRATION_TIMEOUT", severity: "warning", ...details });
      input.reporter.record({ code: "FALLBACK_MEMORY", severity: "warning" });
      return { mode: "memory-only", reason: "Cache lokal sedang dipakai tab lain atau tidak merespons. Tutup tab lain lalu coba lagi." };
    }

    if (isQuotaError(error) && input.cleanup) {
      input.reporter.record({ code: "QUOTA_RECOVERY", severity: "warning", ...details });
      try {
        await input.cleanup();
        const db = await attempt(2);
        return { mode: "indexeddb", db };
      } catch (retryError) {
        input.reporter.record({ code: "MIGRATION_FAILED", severity: "error", attempt: 2, ...describeError(retryError) });
      }
    } else {
      input.reporter.record({ code: "MIGRATION_FAILED", severity: "error", ...details });
    }

    input.reporter.record({ code: "FALLBACK_REBUILD", severity: "warning" });
    return { mode: "rebuild-needed", reason: "Cache layout lokal tidak kompatibel atau rusak. Dokumen dan terjemahan tetap aman; bangun ulang cache layout." };
  }
}

export type DeferredMigrationJob = {
  id: string;
  store: string;
  version: number;
  cursor: string | null;
  status: "pending" | "running" | "completed" | "failed";
};

/**
 * Use this pattern after schema upgrade for large, non-destructive changes.
 * Persist `cursor` after each chunk in a meta store so the job can resume.
 */
export async function runDeferredMigration<T>(input: {
  job: DeferredMigrationJob;
  maxChunks?: number;
  processChunk: (cursor: string | null) => Promise<{ nextCursor: string | null; done: boolean; processed: number }>;
  saveJob: (job: DeferredMigrationJob) => Promise<void>;
  reporter: MigrationReporter;
  shouldCancel?: () => boolean;
}) {
  const maxChunks = input.maxChunks ?? Number.POSITIVE_INFINITY;
  let chunks = 0;
  let job: DeferredMigrationJob = { ...input.job, status: "running" };
  await input.saveJob(job);

  while (chunks < maxChunks && !input.shouldCancel?.()) {
    const result = await input.processChunk(job.cursor);
    job = { ...job, cursor: result.nextCursor, status: result.done ? "completed" : "running" };
    await input.saveJob(job); // checkpoint only after a completed chunk transaction.
    input.reporter.record({ code: "MIGRATION_STARTED", severity: "info", metadata: { deferred: true, processed: result.processed } });
    chunks += 1;
    if (result.done) return job;
    await yieldToBrowser(); // workers also benefit: allows cancellation/message delivery.
  }
  return job;
}
