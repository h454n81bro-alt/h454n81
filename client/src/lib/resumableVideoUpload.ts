export type ResumeCheckpoint = {
  sessionId: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType: string;
};

export type ResumeUploadApi = {
  resumeInit: (input: { sessionId: string; fileName: string; mimeType: string; sourceLanguage: string; totalBytes: number }) => Promise<{ sessionId: string; chunkSize: number; totalChunks: number; uploadedPartIndexes: number[]; completedVideoId: number | null }>;
  resumePreparePart: (input: { sessionId: string; partIndex: number }) => Promise<{ key: string; uploadUrl: string; partIndex: number }>;
  resumeConfirmPart: (input: { sessionId: string; partIndex: number; storageKey: string; byteSize: number; checksum: string }) => Promise<unknown>;
  resumeFallbackPart: (input: { sessionId: string; partIndex: number; byteSize: number; checksum: string; base64: string }) => Promise<unknown>;
  resumeComplete: (input: { sessionId: string }) => Promise<{ videoId: number; cueCount?: number; resumed: boolean }>;
};

const PREFIX = "pustaka-terjemah:video-resume:";

function checkpointKey(file: Pick<File, "name" | "size" | "lastModified">) {
  return `${PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

export function readResumeCheckpoint(file: Pick<File, "name" | "size" | "lastModified">): ResumeCheckpoint | null {
  try {
    const raw = localStorage.getItem(checkpointKey(file));
    if (!raw) return null;
    const checkpoint = JSON.parse(raw) as ResumeCheckpoint;
    return checkpoint.fileName === file.name && checkpoint.fileSize === file.size && checkpoint.lastModified === file.lastModified ? checkpoint : null;
  } catch {
    return null;
  }
}

export function clearResumeCheckpoint(file: Pick<File, "name" | "size" | "lastModified">) {
  try { localStorage.removeItem(checkpointKey(file)); } catch { /* local storage unavailable */ }
}

function saveResumeCheckpoint(file: File, checkpoint: ResumeCheckpoint) {
  try { localStorage.setItem(checkpointKey(file), JSON.stringify(checkpoint)); } catch { /* resume still works for this active tab */ }
}

async function putChunk(uploadUrl: string, chunk: Blob, mimeType: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: chunk });
      if (response.ok) return;
      lastError = new Error(`Penyimpanan menolak bagian video (${response.status}).`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise(resolve => globalThis.setTimeout(resolve, attempt * 700));
  }
  throw lastError instanceof Error ? lastError : new Error("Koneksi terputus saat mengunggah bagian video.");
}

async function sha256Hex(chunk: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await chunk.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function chunkToBase64(chunk: Blob) {
  const bytes = new Uint8Array(await chunk.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(start, start + 0x8000)));
  }
  return btoa(binary);
}

function shouldUseSameOriginFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network|penyimpanan menolak bagian video/i.test(message);
}

export function videoUploadFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Video belum dapat diunggah.";
  if (/failed to fetch|network/i.test(message)) {
    return "Koneksi langsung ke penyimpanan video gagal. Sistem menyimpan checkpoint unggahan; pilih kembali berkas yang sama untuk melanjutkan setelah koneksi stabil.";
  }
  return message;
}

export async function uploadVideoWithResume(
  file: File,
  mimeType: string,
  sourceLanguage: string,
  api: ResumeUploadApi,
  onProgress: (progress: { uploadedChunks: number; totalChunks: number; uploadedBytes: number; totalBytes: number; resumed: boolean; phase: "uploading" | "uploaded" }) => void,
) {
  const prior = readResumeCheckpoint(file);
  const sessionId = prior?.sessionId ?? crypto.randomUUID();
  const session = await api.resumeInit({ sessionId, fileName: file.name, mimeType, sourceLanguage, totalBytes: file.size });
  if (session.completedVideoId) {
    clearResumeCheckpoint(file);
    return { videoId: session.completedVideoId, resumed: true };
  }
  saveResumeCheckpoint(file, { sessionId: session.sessionId, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, mimeType });
  const done = new Set(session.uploadedPartIndexes);
  for (let partIndex = 0; partIndex < session.totalChunks; partIndex += 1) {
    const start = partIndex * session.chunkSize;
    const end = Math.min(file.size, start + session.chunkSize);
    if (!done.has(partIndex)) {
      const target = await api.resumePreparePart({ sessionId: session.sessionId, partIndex });
      const chunk = file.slice(start, end);
      const byteSize = end - start;
      const checksum = await sha256Hex(chunk);
      try {
        await putChunk(target.uploadUrl, chunk, mimeType);
        await api.resumeConfirmPart({ sessionId: session.sessionId, partIndex, storageKey: target.key, byteSize, checksum });
      } catch (error) {
        if (!shouldUseSameOriginFallback(error)) throw error;
        await api.resumeFallbackPart({ sessionId: session.sessionId, partIndex, byteSize, checksum, base64: await chunkToBase64(chunk) });
      }
      done.add(partIndex);
    }
    const uploadedBytes = Array.from(done).reduce((total, index) => total + Math.min(session.chunkSize, file.size - index * session.chunkSize), 0);
    onProgress({ uploadedChunks: done.size, totalChunks: session.totalChunks, uploadedBytes, totalBytes: file.size, resumed: Boolean(prior), phase: "uploading" });
  }
  onProgress({ uploadedChunks: done.size, totalChunks: session.totalChunks, uploadedBytes: file.size, totalBytes: file.size, resumed: Boolean(prior), phase: "uploaded" });
  const result = await api.resumeComplete({ sessionId: session.sessionId });
  clearResumeCheckpoint(file);
  return result;
}
