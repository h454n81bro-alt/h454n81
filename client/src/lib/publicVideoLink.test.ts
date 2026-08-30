import { describe, expect, it } from "vitest";
import { publicVideoDownloadState, publicVideoLinkGuidance, validatePublicVideoLink } from "./publicVideoLink";

describe("validatePublicVideoLink", () => {
  it("menerima tautan HTTP/HTTPS publik", () => {
    expect(validatePublicVideoLink("https://cdn.example.com/video.mp4")).toBeNull();
  });

  it("menolak tautan tidak valid atau alamat internal", () => {
    expect(validatePublicVideoLink("not-a-url")).toContain("valid");
    expect(validatePublicVideoLink("file:///private/video.mp4")).toContain("HTTP");
    expect(validatePublicVideoLink("https://localhost/video.mp4")).toContain("internal");
  });

  it("menonaktifkan aksi saat URL belum valid atau unduhan sedang berjalan", () => {
    expect(publicVideoDownloadState("https://cdn.example.com/video.mp4", false)).toMatchObject({ canSubmit: true, buttonLabel: "Unduh & Proses Video" });
    expect(publicVideoDownloadState("https://localhost/video.mp4", false).canSubmit).toBe(false);
    expect(publicVideoDownloadState("https://cdn.example.com/video.mp4", true)).toMatchObject({ canSubmit: false, buttonLabel: "Mengunduh dan memproses…" });
  });

  it("mengubah pesan halaman web menjadi panduan tautan atau unggah file yang dapat ditindaklanjuti", () => {
    expect(publicVideoLinkGuidance("Tautan mengarah ke halaman web, bukan berkas video langsung. Gunakan URL file media publik yang dapat diputar atau diunduh langsung."))
      .toContain("Gunakan tombol unduh resmi");
    expect(publicVideoLinkGuidance("Video publik tidak dapat diunduh.")).toBeNull();
  });
});
