import {
  type LayoutCheckpoint,
  deleteLayout,
  listLayoutCheckpoints,
  storageHealth,
} from "./indexeddb-layout-checkpoints";

export type LayoutCachePolicy = {
  maxAgeMs?: number;
  maxUsageRatio?: number;
  targetUsageRatio?: number;
  maxCompletedLayouts?: number;
  now?: number;
  dryRun?: boolean;
};

export type CacheRemovalReason = "expired" | "capacity" | "layout-limit";

export type LayoutCacheCleanupResult = {
  before: Awaited<ReturnType<typeof storageHealth>>;
  after: Awaited<ReturnType<typeof storageHealth>>;
  removed: Array<{ layoutKey: string; reason: CacheRemovalReason }>;
  skippedRunning: string[];
};

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_USAGE_RATIO = 0.7;
const DEFAULT_TARGET_USAGE_RATIO = 0.55;
const DEFAULT_MAX_COMPLETED_LAYOUTS = 12;

function usageRatio(health: Awaited<ReturnType<typeof storageHealth>>) {
  return health.quotaBytes > 0 ? health.usageBytes / health.quotaBytes : 0;
}

function lastActivity(checkpoint: LayoutCheckpoint) {
  return checkpoint.lastAccessedAt ?? checkpoint.updatedAt;
}

function oldestFirst(checkpoints: LayoutCheckpoint[]) {
  return [...checkpoints].sort((left, right) => lastActivity(left) - lastActivity(right));
}

/**
 * Delete only completed or failed caches. Running work is never auto-deleted.
 * Run this on app start, before a large export, and after a quota error.
 */
export async function runLayoutCacheCleanup(
  policy: LayoutCachePolicy = {}
): Promise<LayoutCacheCleanupResult> {
  const now = policy.now ?? Date.now();
  const maxAgeMs = policy.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxUsageRatio = policy.maxUsageRatio ?? DEFAULT_MAX_USAGE_RATIO;
  const targetUsageRatio = Math.min(
    policy.targetUsageRatio ?? DEFAULT_TARGET_USAGE_RATIO,
    maxUsageRatio
  );
  const maxCompletedLayouts = policy.maxCompletedLayouts ?? DEFAULT_MAX_COMPLETED_LAYOUTS;
  const dryRun = policy.dryRun ?? false;
  const before = await storageHealth();
  const checkpoints = await listLayoutCheckpoints();
  const safeToDelete = checkpoints.filter(checkpoint => checkpoint.status !== "running");
  const skippedRunning = checkpoints
    .filter(checkpoint => checkpoint.status === "running")
    .map(checkpoint => checkpoint.layoutKey);
  const removed: Array<{ layoutKey: string; reason: CacheRemovalReason }> = [];
  const removedKeys = new Set<string>();

  const remove = async (checkpoint: LayoutCheckpoint, reason: CacheRemovalReason) => {
    if (removedKeys.has(checkpoint.layoutKey)) return;
    if (!dryRun) await deleteLayout(checkpoint.layoutKey);
    removedKeys.add(checkpoint.layoutKey);
    removed.push({ layoutKey: checkpoint.layoutKey, reason });
  };

  for (const checkpoint of oldestFirst(safeToDelete)) {
    if (now - lastActivity(checkpoint) > maxAgeMs) await remove(checkpoint, "expired");
  }

  const retained = oldestFirst(safeToDelete.filter(item => !removedKeys.has(item.layoutKey)));
  const surplus = Math.max(0, retained.length - maxCompletedLayouts);
  for (const checkpoint of retained.slice(0, surplus)) {
    await remove(checkpoint, "layout-limit");
  }

  let current = dryRun ? before : await storageHealth();
  if (usageRatio(current) >= maxUsageRatio) {
    const candidates = oldestFirst(safeToDelete.filter(item => !removedKeys.has(item.layoutKey)));
    for (const checkpoint of candidates) {
      await remove(checkpoint, "capacity");
      if (!dryRun) current = await storageHealth();
      if (usageRatio(current) <= targetUsageRatio) break;
    }
  }

  return {
    before,
    after: dryRun ? before : await storageHealth(),
    removed,
    skippedRunning,
  };
}

/** Convert an IndexedDB quota error into a safe retry workflow. */
export async function recoverFromQuotaExceeded(error: unknown) {
  const isQuotaError = error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "UnknownError");
  if (!isQuotaError) throw error;
  return runLayoutCacheCleanup({ maxUsageRatio: 0, targetUsageRatio: 0 });
}
