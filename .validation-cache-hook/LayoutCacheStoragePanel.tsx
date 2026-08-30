import type { LayoutCacheWorkerClient } from "./layout-cache-worker-client";
import { useLayoutCacheStorage } from "./useLayoutCacheStorage";
import "./layout-cache-storage.css";

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function LayoutCacheStoragePanel({ workerClient }: { workerClient?: LayoutCacheWorkerClient | null }) {
  const cache = useLayoutCacheStorage({ workerClient });
  const isWarning = cache.usagePercent >= 70;

  return (
    <section className="layout-cache-storage" aria-labelledby="cache-storage-title">
      <div className="layout-cache-storage__heading">
        <div>
          <p className="layout-cache-storage__eyebrow">Penyimpanan lokal</p>
          <h2 id="cache-storage-title">Cache layout dokumen</h2>
        </div>
        <button type="button" onClick={cache.refresh} className="layout-cache-storage__refresh" disabled={cache.loading}>Perbarui</button>
      </div>

      <div className="layout-cache-storage__usage">
        <div className="layout-cache-storage__labels"><span>{formatBytes(cache.storage.usageBytes)} dari {formatBytes(cache.storage.quotaBytes)}</span><strong>{cache.usagePercent}%</strong></div>
        <div className="layout-cache-storage__track" role="progressbar" aria-label="Penggunaan penyimpanan cache" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cache.usagePercent}>
          <div className={`layout-cache-storage__fill${isWarning ? " layout-cache-storage__fill--warning" : ""}`} style={{ width: `${cache.usagePercent}%` }} />
        </div>
      </div>

      <dl className="layout-cache-storage__stats">
        <div><dt>Cache siap</dt><dd>{cache.completedCount}</dd></div>
        <div><dt>Dapat dilanjutkan</dt><dd>{cache.resumableCount}</dd></div>
        <div><dt>Sedang berjalan</dt><dd>{cache.runningCount}</dd></div>
        <div><dt>Retensi browser</dt><dd>{cache.storage.isPersistent ? "Persisten" : "Best-effort"}</dd></div>
      </dl>

      <div className="layout-cache-storage__actions">
        <button type="button" onClick={() => void cache.cleanup()} disabled={cache.cleaning || cache.loading} className="layout-cache-storage__cleanup">
          {cache.cleaning ? "Membersihkan…" : "Bersihkan cache lama"}
        </button>
        <span className="layout-cache-storage__hint" aria-live="polite">
          {cache.lastCleanup ? `${cache.lastCleanup.removed.length} cache dihapus; ${cache.lastCleanup.skippedRunning.length} proses aktif dipertahankan.` : "Cache aktif tidak dihapus otomatis."}
        </span>
      </div>
      {cache.error && <p className="layout-cache-storage__error" role="alert">{cache.error}</p>}
    </section>
  );
}
