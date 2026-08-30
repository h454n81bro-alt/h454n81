import { lazy, Suspense } from "react";
import type { CacheMonitoringSnapshot } from "./CacheMonitoringDashboard";

const CacheMonitoringDashboard = lazy(async () => {
  const module = await import("./CacheMonitoringDashboard");
  return { default: module.CacheMonitoringDashboard };
});

export function CacheMonitoringRoute({ fetchSnapshot }: { fetchSnapshot: () => Promise<CacheMonitoringSnapshot> }) {
  return <Suspense fallback={<section aria-busy="true">Memuat dashboard monitoring…</section>}>
    <CacheMonitoringDashboard fetchSnapshot={fetchSnapshot} />
  </Suspense>;
}
