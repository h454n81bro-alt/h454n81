import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type LayoutCacheCleanupResult,
  runLayoutCacheCleanup,
} from "./indexeddb-layout-maintenance";
import {
  listLayoutCheckpoints,
  storageHealth,
  type LayoutCheckpoint,
} from "./indexeddb-layout-checkpoints";
import type { LayoutCacheWorkerClient } from "./layout-cache-worker-client";

type StorageSnapshot = Awaited<ReturnType<typeof storageHealth>>;

export type LayoutCacheStorageState = {
  loading: boolean;
  cleaning: boolean;
  error: string | null;
  storage: StorageSnapshot;
  checkpoints: LayoutCheckpoint[];
  runningCount: number;
  resumableCount: number;
  completedCount: number;
  usagePercent: number;
  lastCleanup: LayoutCacheCleanupResult | null;
  refresh: () => void;
  cleanup: () => Promise<LayoutCacheCleanupResult | null>;
};

const EMPTY_STORAGE: StorageSnapshot = { usageBytes: 0, quotaBytes: 0, isPersistent: false };

export function useLayoutCacheStorage(options: {
  workerClient?: LayoutCacheWorkerClient | null;
  refreshIntervalMs?: number;
} = {}): LayoutCacheStorageState {
  const { workerClient, refreshIntervalMs = 15_000 } = options;
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageSnapshot>(EMPTY_STORAGE);
  const [checkpoints, setCheckpoints] = useState<LayoutCheckpoint[]>([]);
  const [lastCleanup, setLastCleanup] = useState<LayoutCacheCleanupResult | null>(null);

  const refresh = useCallback(() => setRefreshToken(value => value + 1), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [nextStorage, nextCheckpoints] = await Promise.all([storageHealth(), listLayoutCheckpoints()]);
        if (!active) return;
        setStorage(nextStorage);
        setCheckpoints(nextCheckpoints);
        setError(null);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Status penyimpanan tidak dapat dibaca.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), refreshIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const unsubscribe = workerClient?.subscribe(() => void load());

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribe?.();
    };
  }, [refreshIntervalMs, refreshToken, workerClient]);

  const cleanup = useCallback(async () => {
    setCleaning(true);
    try {
      const result = await runLayoutCacheCleanup();
      setLastCleanup(result);
      refresh();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cache lama tidak dapat dibersihkan.");
      return null;
    } finally {
      setCleaning(false);
    }
  }, [refresh]);

  return useMemo(() => {
    const runningCount = checkpoints.filter(item => item.status === "running").length;
    const completedCount = checkpoints.filter(item => item.status === "completed").length;
    const resumableCount = checkpoints.filter(item => item.status === "running" || item.status === "failed").length;
    const usagePercent = storage.quotaBytes > 0 ? Math.min(100, Math.round((storage.usageBytes / storage.quotaBytes) * 100)) : 0;
    return {
      loading,
      cleaning,
      error,
      storage,
      checkpoints,
      runningCount,
      resumableCount,
      completedCount,
      usagePercent,
      lastCleanup,
      refresh,
      cleanup,
    };
  }, [cleaning, checkpoints, cleanup, error, lastCleanup, loading, refresh, storage]);
}
