import type { LayoutCheckpoint } from "./indexeddb-layout-checkpoints";

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: { stage: string; percent: number }) => void;
};

type WorkerMessage =
  | { type: "PROGRESS"; requestId: string; jobId: string; stage: string; percent: number }
  | { type: "RESULT"; requestId: string; jobId: string; result: unknown }
  | { type: "ERROR"; requestId: string; jobId: string; message: string }
  | { type: "CANCELLED"; requestId: string; jobId: string };

export type WorkerChunkInput = {
  layoutKey: string;
  chunkStartPage: number;
  chunkEndPage: number;
  plans: unknown[];
  checkpoint: LayoutCheckpoint;
};

export class LayoutCacheWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL("./layout-cache.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = event => this.handleMessage(event.data as WorkerMessage);
    this.worker.onerror = event => this.failAll(new Error(event.message || "Web Worker cache berhenti."));
  }

  async saveChunk(
    jobId: string,
    input: WorkerChunkInput,
    onProgress?: PendingRequest["onProgress"]
  ) {
    return this.send("SAVE_CHUNK", jobId, input, onProgress);
  }

  async loadChunk(jobId: string, layoutKey: string, chunkStartPage: number) {
    return this.send("LOAD_CHUNK", jobId, { layoutKey, chunkStartPage });
  }

  async deleteLayout(jobId: string, layoutKey: string) {
    return this.send("DELETE_LAYOUT", jobId, { layoutKey });
  }

  cancel(jobId: string) {
    this.worker.postMessage({ type: "CANCEL", jobId });
  }

  dispose() {
    this.failAll(new Error("Worker cache dihentikan."));
    this.worker.terminate();
  }

  private send(type: string, jobId: string, payload: object, onProgress?: PendingRequest["onProgress"]) {
    const requestId = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      this.worker.postMessage({ type, requestId, jobId, ...payload });
    });
  }

  private handleMessage(message: WorkerMessage) {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    if (message.type === "PROGRESS") {
      pending.onProgress?.({ stage: message.stage, percent: message.percent });
      return;
    }
    this.pending.delete(message.requestId);
    if (message.type === "RESULT") pending.resolve(message.result);
    if (message.type === "ERROR") pending.reject(new Error(message.message));
    if (message.type === "CANCELLED") pending.reject(new DOMException("Pekerjaan dibatalkan.", "AbortError"));
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
