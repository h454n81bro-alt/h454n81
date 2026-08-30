import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  completeVideoUploadSession: vi.fn(),
  createVideoConversionJob: vi.fn(),
  createVideo: vi.fn(),
  createVideoNotification: vi.fn(),
  createVideoUploadSession: vi.fn(),
  getVideoCues: vi.fn(),
  getLatestVideoConversionJobForUser: vi.fn(),
  getVideoForUser: vi.fn(),
  getVideoUploadParts: vi.fn(),
  getVideoUploadSessionForUser: vi.fn(),
  listVideosForUser: vi.fn(),
  listVideoNotificationsForUser: vi.fn(),
  markVideoNotificationReadForUser: vi.fn(),
  replaceVideoCues: vi.fn(),
  saveVideoTranslations: vi.fn(),
  saveVideoUploadPart: vi.fn(),
  updateVideoCueTranslation: vi.fn(),
  updateVideo: vi.fn(),
}));
const media = vi.hoisted(() => ({
  downloadPublicVideo: vi.fn(),
  extractAudioFromVideo: vi.fn(),
  validatePublicVideoUrl: vi.fn(),
  validateVideoUpload: vi.fn(),
}));
const storage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGetSignedUrl: vi.fn(), storageCreatePresignedPut: vi.fn() }));
const llm = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
const transcription = vi.hoisted(() => ({ transcribeAudio: vi.fn() }));

vi.mock("../db", () => db);
vi.mock("../storage", () => storage);
vi.mock("../_core/llm", () => llm);
vi.mock("../_core/voiceTranscription", () => transcription);
vi.mock("../videoProcessing", async importActual => ({ ...(await importActual<typeof import("../videoProcessing")>()), ...media }));

import { transcriptionFailureMessage, videoProcessingFailureMessage, videosRouter } from "./videos";

const context = { user: { id: 9 } } as never;

describe("transcriptionFailureMessage", () => {
  it("menjelaskan batas teknis tanpa menyatakan unggahan aplikasi dibatasi", () => {
    expect(transcriptionFailureMessage({ error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE" })).toContain("Unggahan tidak dibatasi oleh aplikasi");
  });

  it("memetakan kegagalan FFmpeg untuk file non-video atau rusak ke pesan ramah", () => {
    expect(videoProcessingFailureMessage(new Error("Audio video tidak dapat diekstrak: Invalid data found when processing input")))
      .toContain("Berkas tidak dapat diproses sebagai video yang valid");
  });
});

describe("videosRouter.subtitle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("menyediakan subtitle SRT dan VTT setelah video milik pengguna berstatus translated", async () => {
    db.getVideoForUser.mockResolvedValue({ id: 44, title: "Kuliah Umum", status: "translated" });
    db.getVideoCues.mockResolvedValue([
      { id: 1, videoId: 44, position: 1, startMs: 0, endMs: 1200, sourceText: "Hello", indonesianText: "Halo" },
    ]);

    const srt = await videosRouter.createCaller(context).subtitle({ videoId: 44, format: "srt" });
    const vtt = await videosRouter.createCaller(context).subtitle({ videoId: 44, format: "vtt" });

    expect(db.getVideoForUser).toHaveBeenCalledWith(44, 9);
    expect(srt.filename).toBe("Kuliah-Umum-id.srt");
    expect(srt.content).toContain("00:00:00,000 --> 00:00:01,200\nHalo");
    expect(vtt.filename).toBe("Kuliah-Umum-id.vtt");
    expect(vtt.content).toContain("WEBVTT");
  });

  it("menolak ekspor ketika video bukan milik pengguna", async () => {
    db.getVideoForUser.mockResolvedValue(undefined);
    await expect(videosRouter.createCaller(context).subtitle({ videoId: 999, format: "vtt" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("videosRouter.download dan request8kConversion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("menghasilkan tautan unduh langsung hanya untuk video milik pengguna", async () => {
    db.getVideoForUser.mockResolvedValue({ id: 44, originalFileName: "kuliah-8k.mkv", storageKey: "videos/9/kuliah-8k.mkv" });
    storage.storageGetSignedUrl.mockResolvedValue("https://storage.example/kuliah-8k.mkv?signature=valid");

    await expect(videosRouter.createCaller(context).download({ videoId: 44 })).resolves.toEqual({
      filename: "kuliah-8k.mkv",
      url: "https://storage.example/kuliah-8k.mkv?signature=valid",
    });
    expect(db.getVideoForUser).toHaveBeenCalledWith(44, 9);
    expect(storage.storageGetSignedUrl).toHaveBeenCalledWith("videos/9/kuliah-8k.mkv");
  });

  it("mengembalikan pesan ramah ketika signed URL unduhan tidak dapat dibuat", async () => {
    db.getVideoForUser.mockResolvedValue({ id: 44, originalFileName: "kuliah.mp4", storageKey: "videos/9/kuliah.mp4" });
    storage.storageGetSignedUrl.mockRejectedValue(new Error("storage tidak tersedia"));

    await expect(videosRouter.createCaller(context).download({ videoId: 44 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Tautan unduh video belum dapat dibuat. Coba lagi beberapa saat lagi.",
    });
  });

  it("membuat satu job 8K queued dan notifikasi untuk video milik pengguna", async () => {
    db.getVideoForUser.mockResolvedValue({ id: 44, title: "Kuliah", storageKey: "videos/9/kuliah.mp4" });
    db.getLatestVideoConversionJobForUser.mockResolvedValue(null);
    db.createVideoConversionJob.mockResolvedValue({ id: 7, videoId: 44, userId: 9, status: "queued", progressPercent: 0 });

    await expect(videosRouter.createCaller(context).request8kConversion({ videoId: 44 })).resolves.toMatchObject({ id: 7, status: "queued" });
    expect(db.createVideoConversionJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 44, targetWidth: 7680, targetHeight: 4320 }));
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 44, kind: "processing" }));
  });
});

describe("videosRouter.importPublicUrl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    media.validatePublicVideoUrl.mockReturnValue(null);
    media.validateVideoUpload.mockReturnValue(null);
    media.downloadPublicVideo.mockResolvedValue({ buffer: Buffer.from("video"), mimeType: "video/mp4" });
    media.extractAudioFromVideo.mockResolvedValue(Buffer.from("audio"));
    storage.storagePut.mockResolvedValueOnce({ key: "videos/source.mp4" }).mockResolvedValueOnce({ key: "videos/audio.mp3" });
    storage.storageGetSignedUrl.mockResolvedValue("https://storage.example/audio.mp3");
    db.createVideo.mockResolvedValue(77);
    db.getVideoCues.mockResolvedValue([{ id: 501, videoId: 77, position: 1, startMs: 0, endMs: 1000, sourceText: "Hello" }]);
    transcription.transcribeAudio.mockResolvedValue({ task: "transcribe", language: "en", duration: 1, text: "Hello", segments: [{ id: 0, seek: 0, start: 0, end: 1, text: "Hello", tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 }] });
    llm.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ translations: [{ id: 501, translation: "Halo" }] }) } }] });
  });

  it("mengimpor video publik yang valid lalu menyimpan cue dan subtitle Indonesia", async () => {
    const result = await videosRouter.createCaller(context).importPublicUrl({ url: "https://cdn.example.org/kuliah.mp4", sourceLanguage: "english" });

    expect(result).toEqual({ videoId: 77, cueCount: 1, durationSeconds: 1 });
    expect(db.createVideo).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, sourceType: "public_url", publicSourceUrl: "https://cdn.example.org/kuliah.mp4", sourceLanguage: "english" }));
    expect(db.updateVideo).toHaveBeenCalledWith(77, expect.objectContaining({ status: "processing" }));
    expect(db.replaceVideoCues).toHaveBeenCalledWith(77, [{ position: 1, startMs: 0, endMs: 1000, sourceText: "Hello" }]);
    expect(db.saveVideoTranslations).toHaveBeenCalledWith(77, [{ id: 501, indonesianText: "Halo" }]);
  });

  it("menolak URL publik yang gagal divalidasi sebelum mencoba unduhan", async () => {
    media.validatePublicVideoUrl.mockReturnValue("Tautan harus mengarah ke server publik.");
    await expect(videosRouter.createCaller(context).importPublicUrl({ url: "https://localhost/video.mp4", sourceLanguage: "auto" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(media.downloadPublicVideo).not.toHaveBeenCalled();
  });

  it("meneruskan pesan ramah ketika tautan publik gagal diunduh", async () => {
    media.downloadPublicVideo.mockRejectedValue(new Error("403 forbidden"));

    await expect(videosRouter.createCaller(context).importPublicUrl({ url: "https://cdn.example.org/private.mp4", sourceLanguage: "auto" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Video publik tidak dapat diunduh. Pastikan tautan langsung, dapat diakses publik, dan tidak dilindungi DRM.",
    });
  });

  it("mengembalikan halaman sumber sebagai panduan non-error ketika tautan bukan berkas media langsung", async () => {
    media.downloadPublicVideo.mockRejectedValue(new Error("Tautan mengarah ke halaman web, bukan berkas video langsung. Gunakan URL file media publik yang dapat diputar atau diunduh langsung."));

    await expect(videosRouter.createCaller(context).importPublicUrl({ url: "https://contoh.org/halaman-video", sourceLanguage: "auto" })).resolves.toEqual({
      sourcePageUrl: "https://contoh.org/halaman-video",
      guidance: expect.stringContaining("Buka halaman sumber"),
    });
    expect(db.createVideo).not.toHaveBeenCalled();
  });
});

describe("videosRouter.upload", () => {
  const configureSuccessfulProcessing = () => {
    media.validateVideoUpload.mockReturnValue(null);
    media.extractAudioFromVideo.mockResolvedValue(Buffer.from("audio"));
    storage.storagePut.mockResolvedValueOnce({ key: "videos/source.mp4" }).mockResolvedValueOnce({ key: "videos/audio.mp3" });
    storage.storageGetSignedUrl.mockResolvedValue("https://storage.example/audio.mp3");
    db.createVideo.mockResolvedValue(88);
    db.getVideoCues.mockResolvedValue([{ id: 601, videoId: 88, position: 1, startMs: 0, endMs: 900, sourceText: "Welcome" }]);
    transcription.transcribeAudio.mockResolvedValue({ task: "transcribe", language: "en", duration: 0.9, text: "Welcome", segments: [{ id: 0, seek: 0, start: 0, end: 0.9, text: "Welcome", tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 }] });
    llm.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ translations: [{ id: 601, translation: "Selamat datang" }] }) } }] });
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("mengunggah video lalu menjalankan processing, cue, dan subtitle Indonesia", async () => {
    configureSuccessfulProcessing();
    const result = await videosRouter.createCaller(context).upload({ fileName: "salam.mp4", mimeType: "video/mp4", sourceLanguage: "english", base64: Buffer.from("video").toString("base64") });

    expect(result).toEqual({ videoId: 88, cueCount: 1, durationSeconds: 1 });
    expect(db.createVideo).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, sourceType: "upload", sourceLanguage: "english" }));
    expect(db.updateVideo).toHaveBeenNthCalledWith(1, 88, { status: "processing", errorMessage: null });
    expect(db.updateVideo).toHaveBeenCalledWith(88, { audioStorageKey: "videos/audio.mp3" });
    expect(db.replaceVideoCues).toHaveBeenCalledWith(88, [{ position: 1, startMs: 0, endMs: 900, sourceText: "Welcome" }]);
    expect(db.updateVideo).toHaveBeenCalledWith(88, { status: "transcribed", cueCount: 1, translatedCount: 0 });
    expect(db.saveVideoTranslations).toHaveBeenCalledWith(88, [{ id: 601, indonesianText: "Selamat datang" }]);
    expect(db.updateVideo).toHaveBeenCalledWith(88, { status: "translated", cueCount: 1, translatedCount: 1 });
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 88, kind: "uploaded" }));
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 88, kind: "processing" }));
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 88, kind: "translated" }));
  });

  it("menyiapkan unggah video langsung tanpa byte base64 di mutasi tRPC", async () => {
    media.validateVideoUpload.mockReturnValue(null);
    storage.storageCreatePresignedPut.mockResolvedValue({ key: "videos/9/besar.mp4", uploadUrl: "https://upload.example/video" });

    const prepared = await videosRouter.createCaller(context).prepareUpload({ fileName: "besar.mp4", mimeType: "video/mp4" });

    expect(prepared).toEqual({ key: "videos/9/besar.mp4", uploadUrl: "https://upload.example/video" });
    expect(storage.storageCreatePresignedPut).toHaveBeenCalledWith(expect.stringMatching(/^videos\/9\//));
  });

  it("memfinalisasi video unggah langsung menggunakan metadata kecil tanpa base64", async () => {
    media.validateVideoUpload.mockReturnValue(null);
    media.extractAudioFromVideo.mockResolvedValue(Buffer.from("audio"));
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/besar.mp4");
    storage.storagePut.mockResolvedValue({ key: "videos/audio.mp3" });
    db.createVideo.mockResolvedValue(92);
    db.getVideoCues.mockResolvedValue([{ id: 602, videoId: 92, position: 1, startMs: 0, endMs: 800, sourceText: "Hello" }]);
    transcription.transcribeAudio.mockResolvedValue({ task: "transcribe", language: "en", duration: 0.8, text: "Hello", segments: [{ id: 0, seek: 0, start: 0, end: 0.8, text: "Hello", tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 }] });
    llm.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ translations: [{ id: 602, translation: "Halo" }] }) } }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("video") }));

    const result = await videosRouter.createCaller(context).finalizeUpload({
      fileName: "besar.mp4",
      mimeType: "video/mp4",
      sourceLanguage: "english",
      storageKey: "videos/9/besar.mp4",
    });

    expect(result).toEqual({ videoId: 92, cueCount: 1, durationSeconds: 1 });
    expect(db.createVideo).toHaveBeenCalledWith(expect.objectContaining({ storageKey: "videos/9/besar.mp4" }));
    vi.unstubAllGlobals();
  });

  it("menandai file generik failed ketika FFmpeg tidak dapat mengekstrak audio", async () => {
    media.validateVideoUpload.mockReturnValue(null);
    media.extractAudioFromVideo.mockRejectedValue(new Error("Audio video tidak dapat diekstrak: Invalid data found when processing input"));
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/berkas-generik.bin");
    db.createVideo.mockResolvedValue(93);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("bukan-video") }));

    await expect(videosRouter.createCaller(context).finalizeUpload({
      fileName: "berkas-generik.bin",
      mimeType: "application/octet-stream",
      sourceLanguage: "auto",
      storageKey: "videos/9/berkas-generik.bin",
    })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Berkas tidak dapat diproses sebagai video yang valid"),
    });

    expect(db.updateVideo).toHaveBeenCalledWith(93, expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("Berkas tidak dapat diproses sebagai video yang valid") }));
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 93, kind: "failed" }));
    vi.unstubAllGlobals();
  });

  it("mengubah kegagalan storage upload menjadi pesan ramah pengguna", async () => {
    media.validateVideoUpload.mockReturnValue(null);
    storage.storagePut.mockRejectedValue(new Error("Storage upload to S3 failed (413 Payload Too Large)"));

    await expect(videosRouter.createCaller(context).upload({
      fileName: "besar.mp4",
      mimeType: "video/mp4",
      sourceLanguage: "auto",
      base64: Buffer.from("video").toString("base64"),
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("Unggahan tidak dibatasi oleh aplikasi"),
    });
    expect(db.createVideo).not.toHaveBeenCalled();
  });

  it("menandai video failed dan menyimpan error saat transkripsi gagal", async () => {
    media.validateVideoUpload.mockReturnValue(null);
    media.extractAudioFromVideo.mockResolvedValue(Buffer.from("audio"));
    storage.storagePut.mockResolvedValueOnce({ key: "videos/source.mp4" }).mockResolvedValueOnce({ key: "videos/audio.mp3" });
    storage.storageGetSignedUrl.mockResolvedValue("https://storage.example/audio.mp3");
    db.createVideo.mockResolvedValue(89);
    transcription.transcribeAudio.mockResolvedValue({ error: "Layanan transkripsi gagal", code: "TRANSCRIPTION_FAILED" });

    await expect(videosRouter.createCaller(context).upload({ fileName: "rusak.mp4", mimeType: "video/mp4", sourceLanguage: "auto", base64: Buffer.from("video").toString("base64") })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.updateVideo).toHaveBeenCalledWith(89, expect.objectContaining({ status: "failed", errorMessage: "Layanan transkripsi gagal" }));
    expect(db.createVideoNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, videoId: 89, kind: "failed" }));
    expect(db.replaceVideoCues).not.toHaveBeenCalled();
  });
});

describe("videosRouter.resume upload", () => {
  const session = {
    id: "00000000-0000-4000-8000-000000000009",
    userId: 9,
    fileName: "besar.mp4",
    mimeType: "video/mp4",
    sourceLanguage: "auto",
    totalBytes: 10_000_000,
    chunkSize: 5 * 1024 * 1024,
    totalChunks: 2,
    status: "uploading",
    finalVideoId: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    media.validateVideoUpload.mockReturnValue(null);
    db.createVideoUploadSession.mockResolvedValue(session);
    db.getVideoUploadSessionForUser.mockResolvedValue(session);
    db.getVideoUploadParts.mockResolvedValue([]);
  });

  it("mengembalikan checkpoint bagian yang sudah tersimpan untuk melanjutkan unggahan", async () => {
    db.getVideoUploadParts.mockResolvedValue([{ partIndex: 0, storageKey: "video-uploads/9/00000000-0000-4000-8000-000000000009/part-0", byteSize: 5 * 1024 * 1024 }]);
    const result = await videosRouter.createCaller(context).resumeInit({ sessionId: session.id, fileName: "besar.mp4", mimeType: "video/mp4", sourceLanguage: "auto", totalBytes: 10_000_000 });
    expect(result).toEqual(expect.objectContaining({ chunkSize: 5 * 1024 * 1024, totalChunks: 2, uploadedPartIndexes: [0] }));
  });

  it("menolak finalisasi resume ketika byte bagian di storage tidak utuh", async () => {
    db.getVideoUploadSessionForUser.mockResolvedValue({ ...session, totalBytes: 10, totalChunks: 1 });
    db.getVideoUploadParts.mockResolvedValue([{ partIndex: 0, storageKey: "video-uploads/9/00000000-0000-4000-8000-000000000009/part-0", byteSize: 10, checksum: "0000000000000000000000000000000000000000000000000000000000000000" }]);
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/part-0");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("pendek") }));

    await expect(videosRouter.createCaller(context).resumeComplete({ sessionId: session.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("tidak diterima lengkap"),
    });
    expect(db.createVideo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("menolak finalisasi resume ketika isi bagian berubah meski ukurannya tetap", async () => {
    db.getVideoUploadSessionForUser.mockResolvedValue({ ...session, totalBytes: 10, totalChunks: 1 });
    db.getVideoUploadParts.mockResolvedValue([{ partIndex: 0, storageKey: "video-uploads/9/00000000-0000-4000-8000-000000000009/part-0", byteSize: 10, checksum: "0000000000000000000000000000000000000000000000000000000000000000" }]);
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/part-0");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("0123456789") }));

    await expect(videosRouter.createCaller(context).resumeComplete({ sessionId: session.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Isi salah satu bagian video berubah"),
    });
    expect(db.createVideo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("menyiapkan dan mencatat bagian upload yang terikat pada sesi pengguna", async () => {
    storage.storageCreatePresignedPut.mockResolvedValue({ key: "video-uploads/9/00000000-0000-4000-8000-000000000009/part-1", uploadUrl: "https://upload.example/part-1" });
    await expect(videosRouter.createCaller(context).resumePreparePart({ sessionId: session.id, partIndex: 1 })).resolves.toEqual(expect.objectContaining({ partIndex: 1 }));
    await videosRouter.createCaller(context).resumeConfirmPart({ sessionId: session.id, partIndex: 1, storageKey: "video-uploads/9/00000000-0000-4000-8000-000000000009/part-1", byteSize: 123, checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(db.saveVideoUploadPart).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id, partIndex: 1, byteSize: 123, checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  });

  it("menyimpan bagian melalui fallback server ketika PUT browser gagal", async () => {
    const content = Buffer.from("0123456789");
    const checksum = createHash("sha256").update(content).digest("hex");
    db.getVideoUploadSessionForUser.mockResolvedValue({ ...session, totalBytes: 10, chunkSize: 10, totalChunks: 1 });
    db.getVideoUploadParts.mockResolvedValue([{ partIndex: 0 }]);
    storage.storagePut.mockResolvedValue({ key: `video-uploads/9/${session.id}/part-0_server` });

    await expect(videosRouter.createCaller(context).resumeFallbackPart({ sessionId: session.id, partIndex: 0, byteSize: 10, checksum, base64: content.toString("base64") })).resolves.toEqual(expect.objectContaining({ usedFallback: true, uploadedCount: 1 }));
    expect(storage.storagePut).toHaveBeenCalledWith(`video-uploads/9/${session.id}/part-0`, content, "video/mp4");
    expect(db.saveVideoUploadPart).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id, partIndex: 0, checksum }));
  });
});

describe("videosRouter.notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("menampilkan riwayat notifikasi pengguna beserta jumlah yang belum dibaca", async () => {
    db.listVideoNotificationsForUser.mockResolvedValue([
      { id: 1, userId: 9, videoId: 71, kind: "translated", title: "Subtitle siap", message: "Video selesai.", readAt: null, createdAt: new Date() },
      { id: 2, userId: 9, videoId: 72, kind: "failed", title: "Video gagal", message: "Periksa file.", readAt: new Date(), createdAt: new Date() },
    ]);

    const result = await videosRouter.createCaller(context).notifications();

    expect(db.listVideoNotificationsForUser).toHaveBeenCalledWith(9);
    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toHaveLength(2);
  });

  it("menandai notifikasi hanya untuk pengguna aktif", async () => {
    db.markVideoNotificationReadForUser.mockResolvedValue(true);
    await expect(videosRouter.createCaller(context).markNotificationRead({ notificationId: 44 })).resolves.toEqual({ success: true });
    expect(db.markVideoNotificationReadForUser).toHaveBeenCalledWith(44, 9);
  });

  it("mengisolasi daftar dan penandaan notifikasi untuk pengguna lain", async () => {
    const otherContext = { ...context, user: { ...context.user, id: 10 } };
    db.listVideoNotificationsForUser.mockResolvedValue([]);
    db.markVideoNotificationReadForUser.mockResolvedValue(true);

    await videosRouter.createCaller(otherContext).notifications();
    await videosRouter.createCaller(otherContext).markNotificationRead({ notificationId: 44 });

    expect(db.listVideoNotificationsForUser).toHaveBeenCalledWith(10);
    expect(db.markVideoNotificationReadForUser).toHaveBeenCalledWith(44, 10);
  });

  it("tidak membocorkan notifikasi pengguna B dalam daftar pengguna A", async () => {
    db.listVideoNotificationsForUser.mockImplementation(async (userId: number) => userId === 9 ? [{ id: 1, userId: 9, videoId: 71, kind: "translated", title: "Milik A", message: "Aman", readAt: null, createdAt: new Date() }] : [{ id: 2, userId: 10, videoId: 72, kind: "failed", title: "Milik B", message: "Rahasia", readAt: null, createdAt: new Date() }]);

    const result = await videosRouter.createCaller(context).notifications();

    expect(result.notifications.map(item => item.id)).toEqual([1]);
    expect(result.notifications.some(item => item.userId === 10)).toBe(false);
  });

  it("menolak penandaan notifikasi pengguna B oleh pengguna A", async () => {
    db.markVideoNotificationReadForUser.mockResolvedValue(false);

    await expect(videosRouter.createCaller(context).markNotificationRead({ notificationId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.markVideoNotificationReadForUser).toHaveBeenCalledWith(2, 9);
  });
});

describe("videosRouter editor dan ringkasan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.getVideoForUser.mockResolvedValue({ id: 73, title: "Materi Kursus", status: "translated", translationSummary: null });
    db.getVideoCues.mockResolvedValue([{ id: 711, videoId: 73, position: 1, startMs: 0, endMs: 1000, sourceText: "Good day", indonesianText: "Selamat siang" }]);
    llm.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Video ini membahas salam pembuka dan pentingnya memulai percakapan dengan ramah." } }] });
  });

  it("menyimpan koreksi subtitle hanya untuk video milik pengguna", async () => {
    const result = await videosRouter.createCaller(context).updateCue({ videoId: 73, cueId: 711, indonesianText: "Selamat pagi" });
    expect(result).toEqual({ success: true });
    expect(db.updateVideoCueTranslation).toHaveBeenCalledWith(73, 711, "Selamat pagi");
    expect(db.updateVideo).toHaveBeenCalledWith(73, { translationSummary: null });
  });

  it("menyediakan ringkasan terjemahan setelah video selesai", async () => {
    const result = await videosRouter.createCaller(context).summary({ videoId: 73 });
    expect(result.filenameBase).toBe("Materi-Kursus-ringkasan-terjemahan");
    expect(result.content).toBe("Video ini membahas salam pembuka dan pentingnya memulai percakapan dengan ramah.");
    expect(result.content).not.toContain("[00:");
    expect(llm.invokeLLM).toHaveBeenCalledOnce();
    expect(db.updateVideo).toHaveBeenCalledWith(73, { translationSummary: result.content });
  });

  it("meregenerasi ringkasan terbaru setelah koreksi subtitle menghapus cache lama", async () => {
    await videosRouter.createCaller(context).updateCue({ videoId: 73, cueId: 711, indonesianText: "Selamat pagi" });
    llm.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: "Ringkasan terbaru membahas pentingnya salam yang ramah." } }] });
    const summary = await videosRouter.createCaller(context).summary({ videoId: 73 });

    expect(db.updateVideo).toHaveBeenCalledWith(73, { translationSummary: null });
    expect(summary.content).toBe("Ringkasan terbaru membahas pentingnya salam yang ramah.");
    expect(db.updateVideo).toHaveBeenCalledWith(73, { translationSummary: summary.content });
  });

  it("menolak koreksi cue yang tidak ada", async () => {
    await expect(videosRouter.createCaller(context).updateCue({ videoId: 73, cueId: 999, indonesianText: "Teks" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.updateVideoCueTranslation).not.toHaveBeenCalled();
  });
});
