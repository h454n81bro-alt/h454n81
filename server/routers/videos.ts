import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  completeVideoUploadSession,
  createVideoConversionJob,
  createVideoNotification,
  createVideo,
  createVideoUploadSession,
  getVideoCues,
  getVideoForUser,
  getLatestVideoConversionJobForUser,
  getVideoUploadParts,
  getVideoUploadSessionForUser,
  listVideosForUser,
  listVideoNotificationsForUser,
  markVideoNotificationReadForUser,
  replaceVideoCues,
  saveVideoTranslations,
  saveVideoUploadPart,
  updateVideoCueTranslation,
  updateVideo,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio, type TranscriptionError, type TranscriptionResponse } from "../_core/voiceTranscription";
import { protectedProcedure, router } from "../_core/trpc";
import { storageCreatePresignedPut, storageGetSignedUrl, storagePut } from "../storage";
import { isStorageUploadError, storageUploadErrorMessage } from "../uploadErrors";
import {
  downloadPublicVideo,
  extractAudioFromVideo,
  toSrt,
  toVtt,
  validatePublicVideoUrl,
  validateVideoUpload,
  VIDEO_FORMATS,
  type SubtitleCue,
} from "../videoProcessing";

const VIDEO_SOURCE_LANGUAGES = ["auto", "arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"] as const;
const RESUME_CHUNK_BYTES = 5 * 1024 * 1024;
const VIDEO_LANGUAGE_LABELS: Record<(typeof VIDEO_SOURCE_LANGUAGES)[number], string> = {
  auto: "bahasa yang terdeteksi otomatis",
  arabic: "Arab",
  english: "Inggris",
  malay: "Melayu",
  turkish: "Turki",
  french: "Prancis",
  german: "Jerman",
  spanish: "Spanyol",
  japanese: "Jepang",
};
const WHISPER_LANGUAGE: Record<(typeof VIDEO_SOURCE_LANGUAGES)[number], string | undefined> = {
  auto: undefined,
  arabic: "ar",
  english: "en",
  malay: "ms",
  turkish: "tr",
  french: "fr",
  german: "de",
  spanish: "es",
  japanese: "ja",
};

function extensionFromName(name: string) {
  const match = /\.[a-z0-9]+$/i.exec(name);
  return match?.[0]?.toLowerCase() ?? ".mp4";
}

function filenameFromPublicUrl(url: string, mimeType: string) {
  const pathname = new URL(url).pathname;
  const fromPath = pathname.split("/").at(-1)?.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (fromPath && /\.[a-z0-9]+$/i.test(fromPath)) return fromPath;
  return `video${VIDEO_FORMATS.find(format => format.mimeType === mimeType)?.extension ?? ".mp4"}`;
}

function videoUploadKey(userId: number, filename: string) {
  return `videos/${userId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
}

async function readStoredVideo(storageKey: string) {
  const response = await fetch(await storageGetSignedUrl(storageKey));
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Video yang diunggah tidak dapat diambil dari penyimpanan. Silakan unggah ulang." });
  return Buffer.from(await response.arrayBuffer());
}

async function combineUploadedVideoParts(parts: Array<{ storageKey: string; byteSize: number; checksum: string | null }>) {
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const response = await fetch(await storageGetSignedUrl(part.storageKey));
    if (!response.ok) throw new Error("Salah satu bagian video belum tersedia di penyimpanan.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length !== part.byteSize) throw new Error("Sebagian data video tidak diterima lengkap oleh penyimpanan. Lanjutkan ulang unggahan dari berkas asli.");
    if (!part.checksum) throw new Error("Sesi resume lama belum memiliki pemeriksaan integritas. Mulai ulang unggahan dari berkas asli.");
    const checksum = createHash("sha256").update(buffer).digest("hex");
    if (checksum !== part.checksum) throw new Error("Isi salah satu bagian video berubah setelah diunggah. Mulai ulang unggahan dari berkas asli.");
    buffers.push(buffer);
  }
  return Buffer.concat(buffers);
}

function cuesFromTranscription(transcription: TranscriptionResponse) {
  const cues = transcription.segments
    .map((segment, index) => ({
      startMs: Math.round(segment.start * 1000),
      endMs: Math.max(Math.round(segment.end * 1000), Math.round(segment.start * 1000) + 1),
      sourceText: segment.text.trim(),
      position: index + 1,
    }))
    .filter(cue => cue.sourceText.length > 0);
  return cues.length ? cues : transcription.text.trim() ? [{ startMs: 0, endMs: Math.max(1, Math.round(transcription.duration * 1000)), sourceText: transcription.text.trim(), position: 1 }] : [];
}

export function transcriptionFailureMessage(error: TranscriptionError) {
  if (error.code === "FILE_TOO_LARGE") {
    return "Unggahan tidak dibatasi oleh aplikasi, tetapi layanan transkripsi saat ini menolak audio hasil ekstraksi sebesar ini. Bagi video menjadi beberapa bagian atau gunakan audio yang lebih ringkas, lalu unggah kembali.";
  }
  return error.error || "Layanan transkripsi belum dapat memproses video ini.";
}

export function videoProcessingFailureMessage(error: unknown) {
  if (isStorageUploadError(error)) return storageUploadErrorMessage(error);
  const message = error instanceof Error ? error.message : "Video gagal diproses.";
  if (message.startsWith("Audio video tidak dapat diekstrak:")) {
    return "Berkas tidak dapat diproses sebagai video yang valid atau media rusak. Pilih file video asli yang dapat diputar, lalu unggah kembali.";
  }
  return message;
}

async function translateCues(cues: Array<{ id: number; sourceText: string }>, sourceLanguage: (typeof VIDEO_SOURCE_LANGUAGES)[number]) {
  if (!cues.length) return [];
  const response = await invokeLLM({
    model: "gpt-5-mini",
    maxTokens: 6000,
    messages: [
      { role: "system", content: `Anda menerjemahkan subtitle video dari ${VIDEO_LANGUAGE_LABELS[sourceLanguage]} ke bahasa Indonesia. Pertahankan makna, konteks, nama, serta panjang teks agar nyaman dibaca sebagai subtitle. Kembalikan JSON valid saja.` },
      { role: "user", content: `Terjemahkan semua cue subtitle berikut ke bahasa Indonesia. Gunakan bentuk {"translations":[{"id":angka,"translation":"teks"}]}; tiap ID harus muncul tepat sekali.\n\n${cues.map(cue => `ID ${cue.id}: ${cue.sourceText}`).join("\n")}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "subtitle_translations",
        strict: true,
        schema: {
          type: "object",
          properties: { translations: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, translation: { type: "string" } }, required: ["id", "translation"], additionalProperties: false } } },
          required: ["translations"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model tidak mengembalikan subtitle Indonesia.");
  const parsed = JSON.parse(content) as { translations: Array<{ id: number; translation: string }> };
  const expected = new Set(cues.map(cue => cue.id));
  const safe = parsed.translations.filter(item => expected.has(item.id) && item.translation.trim().length > 0);
  if (safe.length !== cues.length) throw new Error("Terjemahan subtitle belum lengkap.");
  return safe;
}

async function synthesizeVideoSummary(title: string, cues: SubtitleCue[]) {
  const translatedText = cues.map(cue => cue.indonesianText ?? cue.sourceText).filter(Boolean).join("\n");
  if (!translatedText.trim()) throw new Error("Belum ada subtitle untuk diringkas.");
  const response = await invokeLLM({
    model: "gpt-5-mini",
    maxTokens: 1200,
    messages: [
      { role: "system", content: "Anda adalah penyunting ringkasan bahasa Indonesia. Tulis ringkasan substantif yang setia pada isi video, bukan transkrip, bukan daftar semua kalimat, dan jangan menambahkan fakta yang tidak ada." },
      { role: "user", content: `Buat ringkasan berjudul "${title}" dari terjemahan subtitle berikut. Tulis 2–5 paragraf singkat dalam bahasa Indonesia, jelaskan gagasan utama, poin penting, dan kesimpulan bila ada. Jangan gunakan Markdown atau timestamp.\n\n${translatedText}` },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Model tidak mengembalikan ringkasan video.");
  return content.trim();
}

async function processVideo(videoId: number, userId: number, videoBuffer: Buffer, mimeType: string, filename: string, sourceLanguage: (typeof VIDEO_SOURCE_LANGUAGES)[number]) {
  try {
    await createVideoNotification({ userId, videoId, kind: "uploaded", title: "Video diterima", message: `${filename} berhasil diunggah dan akan mulai diproses.` });
    await updateVideo(videoId, { status: "processing", errorMessage: null });
    await createVideoNotification({ userId, videoId, kind: "processing", title: "Video sedang diproses", message: `${filename} sedang ditranskripsikan dan diterjemahkan ke bahasa Indonesia.` });
    const audio = await extractAudioFromVideo(videoBuffer, extensionFromName(filename));
    const audioStored = await storagePut(`videos/${userId}/${videoId}/audio.mp3`, audio, "audio/mpeg");
    await updateVideo(videoId, { audioStorageKey: audioStored.key });
    const transcript = await transcribeAudio({
      audioUrl: await storageGetSignedUrl(audioStored.key),
      language: WHISPER_LANGUAGE[sourceLanguage],
      prompt: "Transcribe speech accurately with timestamps for subtitle translation.",
    });
    if ("error" in transcript) throw new Error(transcriptionFailureMessage(transcript));
    const cueInput = cuesFromTranscription(transcript);
    if (!cueInput.length) throw new Error("Audio tidak berisi ucapan yang dapat ditranskripsikan.");
    await replaceVideoCues(videoId, cueInput);
    const persistedCues = await getVideoCues(videoId);
    await updateVideo(videoId, { status: "transcribed", cueCount: persistedCues.length, translatedCount: 0 });
    const translations = await translateCues(persistedCues.map(cue => ({ id: cue.id, sourceText: cue.sourceText })), sourceLanguage);
    await saveVideoTranslations(videoId, translations.map(item => ({ id: item.id, indonesianText: item.translation })));
    await updateVideo(videoId, { status: "translated", cueCount: persistedCues.length, translatedCount: persistedCues.length });
    await createVideoNotification({ userId, videoId, kind: "translated", title: "Subtitle Indonesia siap", message: `${filename} selesai diproses dengan ${persistedCues.length} cue subtitle.` });
    return { cueCount: persistedCues.length, durationSeconds: Math.round(transcript.duration) };
  } catch (error) {
    const message = videoProcessingFailureMessage(error);
    await updateVideo(videoId, { status: "failed", errorMessage: message.slice(0, 500) });
    await createVideoNotification({ userId, videoId, kind: "failed", title: "Pemrosesan video gagal", message: `${filename}: ${message.slice(0, 420)}` });
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
}

export const videosRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await listVideosForUser(ctx.user.id)).map(video => ({ ...video, videoUrl: `/manus-storage/${video.storageKey}` }))),

  notifications: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await listVideoNotificationsForUser(ctx.user.id);
    return { notifications, unreadCount: notifications.filter(item => !item.readAt).length };
  }),

  markNotificationRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const marked = await markVideoNotificationReadForUser(input.notificationId, ctx.user.id);
    if (!marked) throw new TRPCError({ code: "NOT_FOUND", message: "Notifikasi tidak ditemukan." });
    return { success: true } as const;
  }),

  get: protectedProcedure.input(z.object({ videoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    return { video: { ...video, videoUrl: `/manus-storage/${video.storageKey}` }, cues: await getVideoCues(video.id) };
  }),

  download: protectedProcedure.input(z.object({ videoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    try {
      return {
        filename: video.originalFileName,
        url: await storageGetSignedUrl(video.storageKey),
      };
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tautan unduh video belum dapat dibuat. Coba lagi beberapa saat lagi." });
    }
  }),

  request8kConversion: protectedProcedure.input(z.object({ videoId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    const existing = await getLatestVideoConversionJobForUser(video.id, ctx.user.id);
    if (existing && (existing.status === "queued" || existing.status === "processing")) return existing;
    const job = await createVideoConversionJob({ userId: ctx.user.id, videoId: video.id, targetWidth: 7680, targetHeight: 4320, status: "queued", progressPercent: 0 });
    await createVideoNotification({ userId: ctx.user.id, videoId: video.id, kind: "processing", title: "Konversi 8K diantrikan", message: `${video.title} menunggu worker transkode 8K.` });
    return job;
  }),

  conversion8kStatus: protectedProcedure.input(z.object({ videoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    return getLatestVideoConversionJobForUser(video.id, ctx.user.id);
  }),

  prepareUpload: protectedProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const validation = validateVideoUpload(input.fileName, input.mimeType, 1);
    if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
    try {
      return await storageCreatePresignedPut(videoUploadKey(ctx.user.id, input.fileName));
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
  }),

  finalizeUpload: protectedProcedure.input(z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    sourceLanguage: z.enum(VIDEO_SOURCE_LANGUAGES),
    storageKey: z.string().min(1).max(1024),
  })).mutation(async ({ ctx, input }) => {
    if (!input.storageKey.startsWith(`videos/${ctx.user.id}/`)) throw new TRPCError({ code: "FORBIDDEN", message: "Video unggahan bukan milik pengguna aktif." });
    const videoBuffer = await readStoredVideo(input.storageKey);
    const validation = validateVideoUpload(input.fileName, input.mimeType, videoBuffer.length);
    if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
    const videoId = await createVideo({ userId: ctx.user.id, title: input.fileName.replace(/\.[^.]+$/, "") || "Video tanpa judul", originalFileName: input.fileName, mimeType: input.mimeType, sourceType: "upload", storageKey: input.storageKey, sourceLanguage: input.sourceLanguage });
    const result = await processVideo(videoId, ctx.user.id, videoBuffer, input.mimeType, input.fileName, input.sourceLanguage);
    return { videoId, ...result };
  }),

  resumeInit: protectedProcedure.input(z.object({
    sessionId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    sourceLanguage: z.enum(VIDEO_SOURCE_LANGUAGES),
    totalBytes: z.number().int().positive().max(2_000_000_000),
  })).mutation(async ({ ctx, input }) => {
    const validation = validateVideoUpload(input.fileName, input.mimeType, 1);
    if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
    const totalChunks = Math.ceil(input.totalBytes / RESUME_CHUNK_BYTES);
    const session = await createVideoUploadSession({ id: input.sessionId, userId: ctx.user.id, fileName: input.fileName, mimeType: input.mimeType, sourceLanguage: input.sourceLanguage, totalBytes: input.totalBytes, chunkSize: RESUME_CHUNK_BYTES, totalChunks, status: "uploading" });
    if (session.fileName !== input.fileName || session.totalBytes !== input.totalBytes || session.mimeType !== input.mimeType) throw new TRPCError({ code: "CONFLICT", message: "Sesi resume ini milik berkas lain. Pilih berkas yang sama atau mulai unggahan baru." });
    const parts = await getVideoUploadParts(session.id);
    return { sessionId: session.id, chunkSize: session.chunkSize, totalChunks: session.totalChunks, uploadedPartIndexes: parts.map(part => part.partIndex), completedVideoId: session.finalVideoId };
  }),

  resumePreparePart: protectedProcedure.input(z.object({ sessionId: z.string().uuid(), partIndex: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
    const session = await getVideoUploadSessionForUser(input.sessionId, ctx.user.id);
    if (!session || session.status !== "uploading") throw new TRPCError({ code: "NOT_FOUND", message: "Sesi resume upload tidak aktif." });
    if (input.partIndex >= session.totalChunks) throw new TRPCError({ code: "BAD_REQUEST", message: "Nomor bagian video tidak valid." });
    try {
      const target = await storageCreatePresignedPut(`video-uploads/${ctx.user.id}/${session.id}/part-${input.partIndex}`);
      return { ...target, partIndex: input.partIndex };
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
  }),

  resumeConfirmPart: protectedProcedure.input(z.object({ sessionId: z.string().uuid(), partIndex: z.number().int().min(0), storageKey: z.string().min(1).max(512), byteSize: z.number().int().positive().max(RESUME_CHUNK_BYTES), checksum: z.string().regex(/^[a-f0-9]{64}$/) })).mutation(async ({ ctx, input }) => {
    const session = await getVideoUploadSessionForUser(input.sessionId, ctx.user.id);
    if (!session || session.status !== "uploading") throw new TRPCError({ code: "NOT_FOUND", message: "Sesi resume upload tidak aktif." });
    if (input.partIndex >= session.totalChunks || !input.storageKey.startsWith(`video-uploads/${ctx.user.id}/${session.id}/`)) throw new TRPCError({ code: "BAD_REQUEST", message: "Bagian unggahan tidak valid." });
    await saveVideoUploadPart({ sessionId: session.id, partIndex: input.partIndex, storageKey: input.storageKey, byteSize: input.byteSize, checksum: input.checksum });
    const parts = await getVideoUploadParts(session.id);
    return { uploadedCount: parts.length, totalChunks: session.totalChunks };
  }),

  resumeFallbackPart: protectedProcedure.input(z.object({
    sessionId: z.string().uuid(),
    partIndex: z.number().int().min(0),
    byteSize: z.number().int().positive().max(RESUME_CHUNK_BYTES),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    base64: z.string().min(1).max(Math.ceil((RESUME_CHUNK_BYTES * 4) / 3) + 1024),
  })).mutation(async ({ ctx, input }) => {
    const session = await getVideoUploadSessionForUser(input.sessionId, ctx.user.id);
    if (!session || session.status !== "uploading") throw new TRPCError({ code: "NOT_FOUND", message: "Sesi resume upload tidak aktif." });
    if (input.partIndex >= session.totalChunks) throw new TRPCError({ code: "BAD_REQUEST", message: "Nomor bagian video tidak valid." });
    const expectedBytes = Math.min(session.chunkSize, session.totalBytes - input.partIndex * session.chunkSize);
    if (input.byteSize !== expectedBytes) throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran bagian video tidak sesuai dengan sesi unggahan." });
    const chunk = Buffer.from(input.base64, "base64");
    if (chunk.length !== input.byteSize || createHash("sha256").update(chunk).digest("hex") !== input.checksum) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Isi bagian video tidak valid. Pilih kembali berkas asli untuk melanjutkan." });
    }
    try {
      const stored = await storagePut(`video-uploads/${ctx.user.id}/${session.id}/part-${input.partIndex}`, chunk, session.mimeType);
      await saveVideoUploadPart({ sessionId: session.id, partIndex: input.partIndex, storageKey: stored.key, byteSize: input.byteSize, checksum: input.checksum });
      const parts = await getVideoUploadParts(session.id);
      return { uploadedCount: parts.length, totalChunks: session.totalChunks, usedFallback: true };
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
  }),

  resumeComplete: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const session = await getVideoUploadSessionForUser(input.sessionId, ctx.user.id);
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sesi resume upload tidak ditemukan." });
    if (session.status === "completed" && session.finalVideoId) return { videoId: session.finalVideoId, resumed: true };
    const parts = await getVideoUploadParts(session.id);
    if (parts.length !== session.totalChunks || parts.some((part, index) => part.partIndex !== index)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unggahan belum lengkap. Lanjutkan bagian video yang belum selesai." });
    let videoBuffer: Buffer;
    try {
      videoBuffer = await combineUploadedVideoParts(parts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bagian video tidak dapat diambil dari penyimpanan.";
      throw new TRPCError({ code: "BAD_REQUEST", message });
    }
    if (videoBuffer.length !== session.totalBytes) throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran video hasil unggahan tidak lengkap. Lanjutkan ulang unggahan dari berkas asli." });
    const validation = validateVideoUpload(session.fileName, session.mimeType, videoBuffer.length);
    if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
    let stored: Awaited<ReturnType<typeof storagePut>>;
    try {
      stored = await storagePut(videoUploadKey(ctx.user.id, session.fileName), videoBuffer, session.mimeType);
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
    const videoId = await createVideo({ userId: ctx.user.id, title: session.fileName.replace(/\.[^.]+$/, "") || "Video tanpa judul", originalFileName: session.fileName, mimeType: session.mimeType, sourceType: "upload", storageKey: stored.key, sourceLanguage: session.sourceLanguage });
    await completeVideoUploadSession(session.id, ctx.user.id, videoId);
    const result = await processVideo(videoId, ctx.user.id, videoBuffer, session.mimeType, session.fileName, session.sourceLanguage);
    return { videoId, ...result, resumed: false };
  }),

  upload: protectedProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(100), sourceLanguage: z.enum(VIDEO_SOURCE_LANGUAGES), base64: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const videoBuffer = Buffer.from(input.base64, "base64");
    const validation = validateVideoUpload(input.fileName, input.mimeType, videoBuffer.length);
    if (validation) throw new TRPCError({ code: validation.includes("maksimal") ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message: validation });
    let stored: Awaited<ReturnType<typeof storagePut>>;
    try {
      stored = await storagePut(videoUploadKey(ctx.user.id, input.fileName), videoBuffer, input.mimeType);
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
    const videoId = await createVideo({ userId: ctx.user.id, title: input.fileName.replace(/\.[^.]+$/, "") || "Video tanpa judul", originalFileName: input.fileName, mimeType: input.mimeType, sourceType: "upload", storageKey: stored.key, sourceLanguage: input.sourceLanguage });
    const result = await processVideo(videoId, ctx.user.id, videoBuffer, input.mimeType, input.fileName, input.sourceLanguage);
    return { videoId, ...result };
  }),

  importPublicUrl: protectedProcedure.input(z.object({ url: z.string().url().max(2048), sourceLanguage: z.enum(VIDEO_SOURCE_LANGUAGES) })).mutation(async ({ ctx, input }) => {
    const validation = validatePublicVideoUrl(input.url);
    if (validation) throw new TRPCError({ code: "BAD_REQUEST", message: validation });
    let downloaded: Awaited<ReturnType<typeof downloadPublicVideo>>;
    try {
      downloaded = await downloadPublicVideo(input.url);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Tautan mengarah ke halaman web")) {
        return {
          sourcePageUrl: input.url,
          guidance: "Tautan ini adalah halaman publik, bukan file video. Buka halaman sumber untuk memakai unduhan resmi, lalu unggah file video atau masukkan URL media publik langsung.",
        };
      }
      const message = "Video publik tidak dapat diunduh. Pastikan tautan langsung, dapat diakses publik, dan tidak dilindungi DRM.";
      throw new TRPCError({ code: "BAD_REQUEST", message });
    }
    const filename = filenameFromPublicUrl(input.url, downloaded.mimeType);
    const videoValidation = validateVideoUpload(filename, downloaded.mimeType, downloaded.buffer.length);
    if (videoValidation) throw new TRPCError({ code: videoValidation.includes("maksimal") ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message: videoValidation });
    let stored: Awaited<ReturnType<typeof storagePut>>;
    try {
      stored = await storagePut(`videos/${ctx.user.id}/${Date.now()}-${filename}`, downloaded.buffer, downloaded.mimeType);
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
    }
    const videoId = await createVideo({ userId: ctx.user.id, title: filename.replace(/\.[^.]+$/, "") || "Video publik", originalFileName: filename, mimeType: downloaded.mimeType, sourceType: "public_url", publicSourceUrl: input.url, storageKey: stored.key, sourceLanguage: input.sourceLanguage });
    const result = await processVideo(videoId, ctx.user.id, downloaded.buffer, downloaded.mimeType, filename, input.sourceLanguage);
    return { videoId, ...result };
  }),

  subtitle: protectedProcedure.input(z.object({ videoId: z.number().int().positive(), format: z.enum(["srt", "vtt"]) })).query(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    const cues: SubtitleCue[] = (await getVideoCues(video.id)).map(cue => ({ ...cue, position: cue.position, startMs: cue.startMs, endMs: cue.endMs, sourceText: cue.sourceText, indonesianText: cue.indonesianText }));
    return { filename: `${video.title.replace(/[^a-zA-Z0-9_-]+/g, "-")}-id.${input.format}`, content: input.format === "srt" ? toSrt(cues) : toVtt(cues) };
  }),

  updateCue: protectedProcedure.input(z.object({ videoId: z.number().int().positive(), cueId: z.number().int().positive(), indonesianText: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    const cue = (await getVideoCues(video.id)).find(item => item.id === input.cueId);
    if (!cue) throw new TRPCError({ code: "NOT_FOUND", message: "Subtitle tidak ditemukan." });
    await updateVideoCueTranslation(video.id, cue.id, input.indonesianText);
    await updateVideo(video.id, { translationSummary: null });
    return { success: true } as const;
  }),

  summary: protectedProcedure.input(z.object({ videoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const video = await getVideoForUser(input.videoId, ctx.user.id);
    if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video tidak ditemukan." });
    const cues: SubtitleCue[] = (await getVideoCues(video.id)).map(cue => ({ position: cue.position, startMs: cue.startMs, endMs: cue.endMs, sourceText: cue.sourceText, indonesianText: cue.indonesianText }));
    const content = video.translationSummary ?? await synthesizeVideoSummary(video.title, cues);
    if (!video.translationSummary) await updateVideo(video.id, { translationSummary: content });
    return { title: video.title, filenameBase: `${video.title.replace(/[^a-zA-Z0-9_-]+/g, "-")}-ringkasan-terjemahan`, content };
  }),
});
