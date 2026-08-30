import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./cache-monitoring-dashboard.css";

export type CacheMonitoringSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  totals: {
    operations: number;
    failedOperations: number;
    fallbackRebuilds: number;
    fallbackMemoryOnly: number;
    activeMigrations: number;
    p95OperationMs: number;
    cacheHitRate: number;
  };
  performanceSeries: Array<{ at: string; p50Ms: number; p95Ms: number; cacheHitRate: number }>;
  errorsByCode: Array<{ code: string; count: number }>;
  recentEvents: Array<{ at: string; severity: "warning" | "error"; code: string; count: number }>;
};

export function useCacheMonitoring(fetchSnapshot: () => Promise<CacheMonitoringSnapshot>, refreshMs = 30_000) {
  const [snapshot, setSnapshot] = useState<CacheMonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const next = await fetchSnapshot();
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Metrik cache belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), refreshMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshMs]);

  return { snapshot, loading, error, refresh };
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function CacheMonitoringDashboard({ fetchSnapshot }: { fetchSnapshot: () => Promise<CacheMonitoringSnapshot> }) {
  const { snapshot, loading, error, refresh } = useCacheMonitoring(fetchSnapshot);
  const errorRate = useMemo(() => {
    if (!snapshot?.totals.operations) return 0;
    return snapshot.totals.failedOperations / snapshot.totals.operations;
  }, [snapshot]);

  if (loading && !snapshot) return <section className="cache-monitoring"><p>Memuat metrik cache produksi…</p></section>;
  if (!snapshot) return <section className="cache-monitoring" role="alert"><p>{error || "Metrik tidak tersedia."}</p><button type="button" onClick={() => void refresh()}>Coba lagi</button></section>;

  return <section className="cache-monitoring" aria-labelledby="cache-monitoring-title">
    <header className="cache-monitoring__header">
      <div><p className="cache-monitoring__eyebrow">Observabilitas produksi</p><h2 id="cache-monitoring-title">Performa cache layout</h2><p>Jendela {snapshot.windowMinutes} menit · diperbarui {new Date(snapshot.generatedAt).toLocaleTimeString("id-ID")}</p></div>
      <button type="button" onClick={() => void refresh()} className="cache-monitoring__refresh">Perbarui</button>
    </header>

    {error && <p className="cache-monitoring__warning" role="status">Data terakhir masih ditampilkan. Pembaruan gagal: {error}</p>}
    <div className="cache-monitoring__kpis">
      <Kpi label="Error rate" value={percent(errorRate)} tone={errorRate >= 0.05 ? "danger" : "default"} detail={`${snapshot.totals.failedOperations} dari ${snapshot.totals.operations} operasi`} />
      <Kpi label="P95 operasi" value={`${Math.round(snapshot.totals.p95OperationMs)} ms`} tone={snapshot.totals.p95OperationMs >= 2_000 ? "warning" : "default"} detail="Serialisasi, worker, dan IndexedDB" />
      <Kpi label="Cache hit rate" value={percent(snapshot.totals.cacheHitRate)} detail="Layout dipulihkan tanpa perhitungan ulang" />
      <Kpi label="Migrasi aktif" value={String(snapshot.totals.activeMigrations)} tone={snapshot.totals.activeMigrations > 0 ? "warning" : "default"} detail={`${snapshot.totals.fallbackRebuilds} rebuild · ${snapshot.totals.fallbackMemoryOnly} memory-only`} />
    </div>

    <div className="cache-monitoring__charts">
      <article className="cache-monitoring__card"><h3>Latensi cache</h3><ResponsiveContainer width="100%" height={230}><LineChart data={snapshot.performanceSeries}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="at" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit=" ms" /><Tooltip /><Line type="monotone" dataKey="p50Ms" stroke="#70977f" strokeWidth={2} dot={false} name="P50" /><Line type="monotone" dataKey="p95Ms" stroke="#b78640" strokeWidth={2} dot={false} name="P95" /></LineChart></ResponsiveContainer></article>
      <article className="cache-monitoring__card"><h3>Error berdasarkan kode</h3><ResponsiveContainer width="100%" height={230}><BarChart data={snapshot.errorsByCode}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={55} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#c76152" radius={[4, 4, 0, 0]} name="Error" /></BarChart></ResponsiveContainer></article>
    </div>

    <article className="cache-monitoring__events"><h3>Peristiwa terbaru</h3>{snapshot.recentEvents.length ? <ul>{snapshot.recentEvents.map(event => <li key={`${event.at}-${event.code}`}><time>{new Date(event.at).toLocaleTimeString("id-ID")}</time><span className={`cache-monitoring__badge cache-monitoring__badge--${event.severity}`}>{event.severity}</span><strong>{event.code}</strong><span>{event.count} kejadian</span></li>)}</ul> : <p>Tidak ada peristiwa warning atau error pada jendela ini.</p>}</article>
  </section>;
}

function Kpi({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "warning" | "danger" }) {
  return <article className={`cache-monitoring__kpi cache-monitoring__kpi--${tone}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}
