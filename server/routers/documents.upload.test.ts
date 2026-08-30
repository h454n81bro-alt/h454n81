import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createDocumentWithSegments: vi.fn() }));
const storage = vi.hoisted(() => ({ storagePut: vi.fn(), storageCreatePresignedPut: vi.fn(), storageGetSignedUrl: vi.fn() }));

vi.mock("../db", () => db);
vi.mock("../storage", () => storage);
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

import { documentsRouter } from "./documents";

const context = { user: { id: 41 } } as never;

describe("documentsRouter.upload", () => {
  it("mengubah penolakan storage menjadi pesan ramah untuk unggahan besar", async () => {
    storage.storagePut.mockRejectedValue(new Error("Storage upload to S3 failed (413 Payload Too Large)"));
    const arabicText = Buffer.from("هذا نص عربي صالح للاختبار").toString("base64");

    await expect(documentsRouter.createCaller(context).upload({
      fileName: "kitab.txt",
      mimeType: "text/plain",
      sourceLanguage: "arabic",
      base64: arabicText,
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("Unggahan tidak dibatasi oleh aplikasi"),
    });
    expect(db.createDocumentWithSegments).not.toHaveBeenCalled();
  });

  it("menyiapkan dan memfinalisasi unggahan langsung dengan metadata kecil, bukan base64", async () => {
    storage.storageCreatePresignedPut.mockResolvedValue({ key: "documents/41/kitab.txt", uploadUrl: "https://upload.example/put" });
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/kitab.txt");
    db.createDocumentWithSegments.mockResolvedValue(123);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("هذا نص عربي صالح للاختبار") }));

    const prepared = await documentsRouter.createCaller(context).prepareUpload({ fileName: "kitab.txt", mimeType: "text/plain" });
    const finalized = await documentsRouter.createCaller(context).finalizeUpload({
      fileName: "kitab.txt",
      mimeType: "text/plain",
      sourceLanguage: "arabic",
      storageKey: prepared.key,
    });

    expect(prepared.uploadUrl).toBe("https://upload.example/put");
    expect(finalized).toEqual({ documentId: 123, paragraphCount: 1 });
    expect(db.createDocumentWithSegments).toHaveBeenCalledWith(expect.objectContaining({ storageKey: "documents/41/kitab.txt" }), expect.any(Array));
    vi.unstubAllGlobals();
  });
});
