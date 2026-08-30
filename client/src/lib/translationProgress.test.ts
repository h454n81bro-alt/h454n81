import { describe, expect, it, vi } from "vitest";
import { translateUntilComplete, uploadAndTranslate } from "./translationProgress";

describe("uploadAndTranslate", () => {
  it("memicu penerjemahan otomatis setelah upload berhasil", async () => {
    const upload = vi.fn(async () => ({ documentId: 9, paragraphCount: 24 }));
    const translate = vi.fn(async () => undefined);

    await expect(uploadAndTranslate({ upload, translate })).resolves.toEqual({ documentId: 9, paragraphCount: 24 });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith({ documentId: 9, paragraphCount: 24 });
  });

  it("meneruskan error layanan upload dan tidak memulai terjemahan", async () => {
    const upload = vi.fn(async () => { throw new Error("Layanan penyimpanan tidak dapat menerima unggahan saat ini."); });
    const translate = vi.fn(async () => undefined);

    await expect(uploadAndTranslate({ upload, translate })).rejects.toThrow("penyimpanan");
    expect(translate).not.toHaveBeenCalled();
  });
});

describe("translateUntilComplete", () => {
  it("menjalankan batch sampai seluruh paragraf selesai dan menyegarkan progres", async () => {
    const refresh = vi.fn(async () => undefined);
    const translateBatch = vi
      .fn()
      .mockResolvedValueOnce({ finished: false, translatedCount: 8, paragraphCount: 13 })
      .mockResolvedValueOnce({ finished: true, translatedCount: 13, paragraphCount: 13 });

    const completed = await translateUntilComplete({
      documentId: 42,
      paragraphCount: 13,
      initialCount: 0,
      translateBatch,
      refresh,
    });

    expect(completed).toBe(13);
    expect(translateBatch).toHaveBeenCalledTimes(2);
    expect(translateBatch).toHaveBeenNthCalledWith(1, 42);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("meneruskan error batch agar UI dapat menandai dokumen gagal", async () => {
    const translateBatch = vi.fn(async () => { throw new Error("LLM tidak tersedia"); });
    const refresh = vi.fn(async () => undefined);

    await expect(translateUntilComplete({
      documentId: 7,
      paragraphCount: 5,
      initialCount: 0,
      translateBatch,
      refresh,
    })).rejects.toThrow("LLM tidak tersedia");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tidak memanggil API jika dokumen sudah selesai", async () => {
    const translateBatch = vi.fn();
    const refresh = vi.fn(async () => undefined);

    const completed = await translateUntilComplete({
      documentId: 7,
      paragraphCount: 5,
      initialCount: 5,
      translateBatch,
      refresh,
    });

    expect(completed).toBe(5);
    expect(translateBatch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
