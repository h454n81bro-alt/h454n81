import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { buildVideoTranslationSummary, downloadPublicVideo, runSerializedVideoTask, toSrt, toVtt, validatePublicVideoUrl, validateVideoUpload } from "./videoProcessing";

describe("validateVideoUpload", () => {
  it("menerima format video umum tanpa bergantung pada metadata MIME", () => {
    expect(validateVideoUpload("ceramah.mp4", "video/mp4", 1024)).toBeNull();
    expect(validateVideoUpload("ceramah.webm", "video/webm", 1024)).toBeNull();
    expect(validateVideoUpload("ceramah.mov", "video/quicktime", 1024)).toBeNull();
    expect(validateVideoUpload("rekaman.tipe-baru", "application/pdf", 1024)).toBeNull();
  });

  it("menerima video besar tanpa batas ukuran buatan aplikasi", () => {
    expect(validateVideoUpload("ceramah.mp4", "video/mp4", 2 * 1024 * 1024 * 1024)).toBeNull();
    expect(validateVideoUpload("kosong.mp4", "video/mp4", 0)).toContain("kosong");
  });

  it("menerima MIME generik, kosong, atau variasi browser dan menolak hanya berkas kosong", () => {
    expect(validateVideoUpload("rekaman.MP4", "application/octet-stream", 1)).toBeNull();
    expect(validateVideoUpload("rekaman.MOV", "", 1)).toBeNull();
    expect(validateVideoUpload("rekaman.mkv", "video/unknown", 1)).toBeNull();
    expect(validateVideoUpload("rekaman.tipe-baru", "application/pdf", 1)).toBeNull();
  });
});

describe("validatePublicVideoUrl", () => {
  it("menerima HTTPS publik serta menolak skema dan alamat privat", () => {
    expect(validatePublicVideoUrl("https://cdn.contoh.org/ceramah.mp4")).toBeNull();
    expect(validatePublicVideoUrl("file:///private/video.mp4")).toContain("HTTP atau HTTPS");
    expect(validatePublicVideoUrl("https://localhost/video.mp4")).toContain("publik");
    expect(validatePublicVideoUrl("http://192.168.1.5/video.mp4")).toContain("publik");
  });
});

describe("downloadPublicVideo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("menolak halaman HTML sehingga tidak diteruskan ke FFmpeg sebagai video", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      arrayBuffer: async () => Buffer.from("<html><body>Halaman video</body></html>"),
    }));

    await expect(downloadPublicVideo("https://contoh.org/halaman-video")).rejects.toThrow("halaman web, bukan berkas video langsung");
  });
});

describe("subtitle exports", () => {
  const cues = [
    { position: 1, startMs: 0, endMs: 1450, sourceText: "Hello", indonesianText: "Halo" },
    { position: 2, startMs: 1500, endMs: 3200, sourceText: "Knowledge is power", indonesianText: "Ilmu adalah kekuatan" },
  ];

  it("membuat SRT dan VTT dengan timestamp valid", () => {
    expect(toSrt(cues)).toContain("00:00:00,000 --> 00:00:01,450\nHalo");
    expect(toVtt(cues)).toContain("WEBVTT\n\n00:00:00.000 --> 00:00:01.450\nHalo");
    expect(buildVideoTranslationSummary("Kuliah", cues)).toContain("Ringkasan Terjemahan Video\nKuliah");
    expect(buildVideoTranslationSummary("Kuliah", cues)).toContain("Halo");
  });
});

describe("runSerializedVideoTask", () => {
  it("menjalankan pekerjaan video satu per satu untuk melindungi memori", async () => {
    const order: string[] = [];
    const first = runSerializedVideoTask(async () => { order.push("first:start"); await Promise.resolve(); order.push("first:end"); });
    const second = runSerializedVideoTask(async () => { order.push("second:start"); order.push("second:end"); });
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});
