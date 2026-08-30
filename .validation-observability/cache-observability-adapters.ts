export type CacheTelemetryContext = {
  code: string;
  stage: "migration" | "worker" | "indexeddb" | "cleanup" | "dashboard";
  cacheMode?: "indexeddb" | "memory-only" | "rebuild-needed";
  attempt?: number;
  durationMs?: number;
  quotaUsageBucket?: "low" | "medium" | "high";
};

export interface CacheObservabilityAdapter {
  reportError(error: unknown, context: CacheTelemetryContext): void;
  recordMetric(name: string, value: number, attributes: Record<string, string>): void;
}

function safeAttributes(context: CacheTelemetryContext) {
  // Keep browser telemetry low-cardinality and free of user/document content.
  return {
    code: context.code,
    stage: context.stage,
    cache_mode: context.cacheMode ?? "unknown",
    attempt: String(context.attempt ?? 1),
    quota_bucket: context.quotaUsageBucket ?? "unknown",
  };
}

type SentryLike = {
  captureException(error: unknown, configureScope?: (scope: {
    setTag(key: string, value: string): void;
    setExtra(key: string, value: number): void;
  }) => void): void;
};

export function createSentryCacheAdapter(sentry: SentryLike): CacheObservabilityAdapter {
  return {
    reportError(error, context) {
      sentry.captureException(error, scope => {
        for (const [key, value] of Object.entries(safeAttributes(context))) scope.setTag(key, value);
        if (context.durationMs !== undefined) scope.setExtra("duration_ms", context.durationMs);
      });
    },
    recordMetric() {
      // Send aggregate metrics to the first-party backend; avoid one Sentry event per success.
    },
  };
}

type DatadogRumLike = {
  addError(error: unknown, context?: Record<string, unknown>): void;
  addAction(name: string, context?: Record<string, unknown>): void;
};

export function createDatadogCacheAdapter(datadogRum: DatadogRumLike): CacheObservabilityAdapter {
  return {
    reportError(error, context) {
      datadogRum.addError(error, safeAttributes(context));
    },
    recordMetric(name, value, attributes) {
      datadogRum.addAction(name, { value, ...attributes });
    },
  };
}

/** Use for development, consent-denied users, or an unavailable third-party SDK. */
export function createNoopCacheAdapter(): CacheObservabilityAdapter {
  return { reportError() {}, recordMetric() {} };
}

export function reportCacheFailure(
  adapter: CacheObservabilityAdapter,
  error: unknown,
  context: CacheTelemetryContext
) {
  adapter.reportError(error, context);
  adapter.recordMetric("layout_cache_error_total", 1, safeAttributes(context));
}
