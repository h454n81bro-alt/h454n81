import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const VIDEO_FORMATS = [
  { extension: ".mp4", mimeType: "video/mp4" },
  { extension: ".webm", mimeType: "video/webm" },
  { extension: ".mov", mimeType: "video/quicktime" },
  { extension: ".mkv", mimeType: "video/x-matroska" },
  { extension: ".avi", mimeType: "video/x-msvideo" },
  { extension: ".mpeg", mimeType: "video/mpeg" },
  { extension: ".mpg", mimeType: "video/mpeg" },
  { extension: ".m4v", mimeType: "video/x-m4v" },
] as const;

export type VideoMimeType = (typeof VIDEO_FORMATS)[number]["mimeType"];
export type SubtitleCue = { position: number; startMs: number; endMs: number; sourceText: string; indonesianText: string | null };

export function validateVideoUpload(fileName: string, mimeType: string, byteLength: number) {
  void fileName;
  void mimeType;
  if (byteLength <= 0) return "Video kosong tidak dapat diproses.";
  return null;
}

export function validatePublicVideoUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Tautan video tidak valid.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Gunakan tautan HTTP atau HTTPS publik.";
  const host = url.hostname.toLowerCase();
  const privateHost = host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.startsWith("169.254.");
  if (privateHost) return "Tautan harus mengarah ke server publik, bukan alamat lokal atau privat.";
  return null;
}

export async function downloadPublicVideo(url: string) {
  const validation = validatePublicVideoUrl(url);
  if (validation) throw new Error(validation);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Video publik tidak dapat diunduh (HTTP ${response.status}).`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    throw new Error("Tautan mengarah ke halaman web, bukan berkas video langsung. Gunakan URL file media publik yang dapat diputar atau diunduh langsung.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

let videoTaskTail = Promise.resolve();

/** Menjaga agar ekstraksi FFmpeg yang memakan memori berjalan satu per satu. */
export function runSerializedVideoTask<T>(task: () => Promise<T>) {
  const result = videoTaskTail.then(task, task);
  videoTaskTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function extractAudioFromVideo(videoBuffer: Buffer, extension: string) {
  return runSerializedVideoTask(async () => {
    const workspace = await mkdtemp(join(tmpdir(), "pustaka-video-"));
    const input = join(workspace, `source${extension}`);
    const output = join(workspace, "audio.mp3");
    try {
      await writeFile(input, videoBuffer);
      await execFileAsync("ffmpeg", ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", output], { timeout: 120_000, maxBuffer: 1_000_000 });
      return await readFile(output);
    } catch (error) {
      throw new Error(error instanceof Error ? `Audio video tidak dapat diekstrak: ${error.message}` : "Audio video tidak dapat diekstrak.");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
}

function subtitleTimestamp(milliseconds: number, separator: "," | ".") {
  const value = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  const remainder = value % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(remainder).padStart(3, "0")}`;
}

export function toSrt(cues: SubtitleCue[]) {
  return cues.map(cue => `${cue.position}\n${subtitleTimestamp(cue.startMs, ",")} --> ${subtitleTimestamp(cue.endMs, ",")}\n${cue.indonesianText ?? cue.sourceText}`).join("\n\n");
}

export function toVtt(cues: SubtitleCue[]) {
  return `WEBVTT\n\n${cues.map(cue => `${subtitleTimestamp(cue.startMs, ".")} --> ${subtitleTimestamp(cue.endMs, ".")}\n${cue.indonesianText ?? cue.sourceText}`).join("\n\n")}`;
}

export function buildVideoTranslationSummary(title: string, cues: SubtitleCue[]) {
  const body = cues.map(cue => `[${subtitleTimestamp(cue.startMs, ".")}–${subtitleTimestamp(cue.endMs, ".")}] ${cue.indonesianText ?? cue.sourceText}`).join("\n\n");
  return `Ringkasan Terjemahan Video\n${title}\n\n${body || "Belum ada subtitle yang dapat diringkas."}`;
}
