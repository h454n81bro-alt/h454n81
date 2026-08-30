import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutCacheWorkerClient,
  type WorkerChunkInput,
} from "./layout-cache-worker-client";
import "./layout-cache-progress.css";

type RunStatus = "idle" | "running" | "cancelling" | "completed" | "cancelled" | "failed";

type Stage = "idle" | "serializing" | "writing" | "reading" | "decompressing" | "completed" | "cancelled" | "failed";

export type LayoutCacheProgressProps = {
  chunks: WorkerChunkInput[];
  onCompleted?: () => void;
};

const stageCopy: Record<Stage, { title: string; detail: string }> = {
  idle: { title: "Siap menyiapkan cache", detail: "Rencana layout akan diproses dalam beberapa bagian kecil." },
  serializing: { title: "Menyiapkan layout", detail: "Menyusun dan mengompresi data layout." },
  writing: { title: "Menyimpan checkpoint", detail: "Menulis cache dan checkpoint secara aman di perangkat ini." },
  reading: { title: "Membaca cache", detail: "Menemukan kembali bagian layout yang telah disimpan." },
  decompressing: { title: "Memulihkan layout", detail: "Mendekompresi data cache untuk digunakan kembali." },
  completed: { title: "Cache layout siap", detail: "Seluruh bagian selesai diproses dan dapat digunakan untuk ekspor." },
  cancelled: { title: "Proses dibatalkan", detail: "Bagian yang telah selesai tetap tersimpan dan dapat dilanjutkan nanti." },
  failed: { title: "Proses memerlukan perhatian", detail: "Tidak semua bagian dapat disimpan. Anda dapat mencoba kembali." },
};

export function LayoutCacheProgress({ chunks, onCompleted }: LayoutCacheProgressProps) {
  const workerRef = useRef<LayoutCacheWorkerClient | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = new LayoutCacheWorkerClient();
    workerRef.current = client;
    return () => {
      activeJobRef.current = null;
      client.dispose();
      workerRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    const client = workerRef.current;
    if (!client || !chunks.length || status === "running" || status === "cancelling") return;

    const jobId = crypto.randomUUID();
    activeJobRef.current = jobId;
    setStatus("running");
    setStage("serializing");
    setProgress(0);
    setCompletedChunks(0);
    setErrorMessage(null);

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (activeJobRef.current !== jobId) throw new DOMException("Pekerjaan dibatalkan.", "AbortError");
        const chunk = chunks[index]!;
        await client.saveChunk(jobId, chunk, workerProgress => {
          if (activeJobRef.current !== jobId) return;
          const ratio = Math.min(1, Math.max(0, workerProgress.percent / 100));
          setStage(workerProgress.stage as Stage);
          setProgress(Math.round(((index + ratio) / chunks.length) * 100));
        });
        setCompletedChunks(index + 1);
        setProgress(Math.round(((index + 1) / chunks.length) * 100));
      }

      if (activeJobRef.current === jobId) {
        setStatus("completed");
        setStage("completed");
        onCompleted?.();
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setStatus(cancelled ? "cancelled" : "failed");
      setStage(cancelled ? "cancelled" : "failed");
      if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "Cache layout tidak dapat diproses.");
    } finally {
      if (activeJobRef.current === jobId) activeJobRef.current = null;
    }
  }, [chunks, onCompleted, status]);

  const cancel = useCallback(() => {
    const jobId = activeJobRef.current;
    if (!jobId) return;
    setStatus("cancelling");
    workerRef.current?.cancel(jobId);
  }, []);

  const canStart = chunks.length > 0 && status !== "running" && status !== "cancelling";
  const copy = stageCopy[stage];

  return (
    <section className="layout-cache-progress" aria-labelledby="layout-cache-progress-title">
      <div className="layout-cache-progress__header">
        <div>
          <p className="layout-cache-progress__eyebrow">Persiapan ekspor</p>
          <h2 id="layout-cache-progress-title">{copy.title}</h2>
          <p className="layout-cache-progress__detail" aria-live="polite">{copy.detail}</p>
        </div>
        <span className="layout-cache-progress__percent" aria-label={`${progress}% selesai`}>{progress}%</span>
      </div>

      <div className="layout-cache-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progres cache layout">
        <div className="layout-cache-progress__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="layout-cache-progress__footer">
        <span>{completedChunks} dari {chunks.length} bagian selesai</span>
        <div className="layout-cache-progress__actions">
          {status === "running" || status === "cancelling" ? (
            <button type="button" onClick={cancel} disabled={status === "cancelling"} className="layout-cache-progress__button layout-cache-progress__button--secondary">
              {status === "cancelling" ? "Membatalkan…" : "Batalkan"}
            </button>
          ) : (
            <button type="button" onClick={start} disabled={!canStart} className="layout-cache-progress__button">
              {status === "completed" ? "Bangun ulang cache" : status === "cancelled" ? "Lanjutkan cache" : "Mulai proses"}
            </button>
          )}
        </div>
      </div>

      {errorMessage && <p className="layout-cache-progress__error" role="alert">{errorMessage}</p>}
    </section>
  );
}
