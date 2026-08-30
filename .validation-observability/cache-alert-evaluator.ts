export type CacheMetricWindow = {
  endAt: number;
  operationCount: number;
  failedOperationCount: number;
  p95OperationMs: number;
  migrationFailureCount: number;
  memoryOnlyFallbackCount: number;
};

export type CacheAlert = {
  key: "cache_error_rate" | "migration_failure" | "memory_only_fallback" | "cache_latency";
  severity: "warning" | "critical";
  summary: string;
  windowEndAt: number;
  value: number;
};

export type CacheAlertPolicy = {
  minimumOperations?: number;
  warningErrorRate?: number;
  criticalErrorRate?: number;
  warningP95Ms?: number;
  criticalP95Ms?: number;
  consecutiveWindows?: number;
};

const defaults: Required<CacheAlertPolicy> = {
  minimumOperations: 25,
  warningErrorRate: 0.03,
  criticalErrorRate: 0.08,
  warningP95Ms: 1_500,
  criticalP95Ms: 3_000,
  consecutiveWindows: 2,
};

function lastConsecutive<T>(windows: T[], predicate: (window: T) => boolean) {
  let count = 0;
  for (let index = windows.length - 1; index >= 0 && predicate(windows[index]!); index -= 1) count += 1;
  return count;
}

/**
 * Evaluate this on the server/Heartbeat callback, never inside the dashboard.
 * The browser may be closed; server-side evaluation makes alerts dependable.
 */
export function evaluateCacheAlerts(
  windows: CacheMetricWindow[],
  inputPolicy: CacheAlertPolicy = {}
): CacheAlert[] {
  if (!windows.length) return [];
  const policy = { ...defaults, ...inputPolicy };
  const latest = windows[windows.length - 1]!;
  const alerts: CacheAlert[] = [];
  const errorRate = latest.operationCount ? latest.failedOperationCount / latest.operationCount : 0;
  const eligible = (window: CacheMetricWindow) => window.operationCount >= policy.minimumOperations;

  const criticalError = lastConsecutive(windows, window => eligible(window) && window.failedOperationCount / window.operationCount >= policy.criticalErrorRate);
  const warningError = lastConsecutive(windows, window => eligible(window) && window.failedOperationCount / window.operationCount >= policy.warningErrorRate);
  if (criticalError >= policy.consecutiveWindows || warningError >= policy.consecutiveWindows) {
    const severity = criticalError >= policy.consecutiveWindows ? "critical" : "warning";
    alerts.push({ key: "cache_error_rate", severity, value: errorRate, windowEndAt: latest.endAt, summary: `Error rate cache ${(errorRate * 100).toFixed(1)}% pada window terbaru.` });
  }

  if (latest.migrationFailureCount > 0) {
    alerts.push({ key: "migration_failure", severity: "critical", value: latest.migrationFailureCount, windowEndAt: latest.endAt, summary: `${latest.migrationFailureCount} migrasi cache gagal pada window terbaru.` });
  }
  if (latest.memoryOnlyFallbackCount > 0) {
    alerts.push({ key: "memory_only_fallback", severity: "warning", value: latest.memoryOnlyFallbackCount, windowEndAt: latest.endAt, summary: `${latest.memoryOnlyFallbackCount} fallback memory-only terdeteksi.` });
  }

  const criticalLatency = lastConsecutive(windows, window => window.p95OperationMs >= policy.criticalP95Ms);
  const warningLatency = lastConsecutive(windows, window => window.p95OperationMs >= policy.warningP95Ms);
  if (criticalLatency >= policy.consecutiveWindows || warningLatency >= policy.consecutiveWindows) {
    const severity = criticalLatency >= policy.consecutiveWindows ? "critical" : "warning";
    alerts.push({ key: "cache_latency", severity, value: latest.p95OperationMs, windowEndAt: latest.endAt, summary: `P95 operasi cache ${Math.round(latest.p95OperationMs)} ms pada window terbaru.` });
  }
  return alerts;
}

export type AlertDelivery = (alert: CacheAlert) => Promise<void>;

/** Persist sent keys on the server and suppress duplicates there before delivery. */
export async function deliverNewAlerts(alerts: CacheAlert[], alreadySent: (key: string, windowEndAt: number) => Promise<boolean>, deliver: AlertDelivery) {
  for (const alert of alerts) {
    if (!(await alreadySent(alert.key, alert.windowEndAt))) await deliver(alert);
  }
}
