import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearResumeCheckpoint, readResumeCheckpoint, uploadVideoWithResume, videoUploadFailureMessage } from "./resumableVideoUpload";

function createFile(bytes: number) {
  return new File([new Uint8Array(bytes)], "besar.mp4", { type: "video/mp4", lastModified: 123 });
}

describe("uploadVideoWithResume", () => {
  let values = new Map<string, string>();
  beforeEach(() => {
    values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });
  afterEach(() => { values.clear(); vi.unstubAllGlobals(); });

  it("melewati bagian yang telah tersimpan dan melanjutkan bagian yang tersisa", async () => {
    const file = createFile(12);
    const api = {
      resumeInit: vi.fn().mockResolvedValue({ sessionId: "00000000-0000-4000-8000-000000000001", chunkSize: 5, totalChunks: 3, uploadedPartIndexes: [0], completedVideoId: null }),
      resumePreparePart: vi.fn(async ({ partIndex }) => ({ key: `parts/${partIndex}`, uploadUrl: `https://upload.example/${partIndex}`, partIndex })),
      resumeConfirmPart: vi.fn(),
      resumeFallbackPart: vi.fn(),
      resumeComplete: vi.fn().mockResolvedValue({ videoId: 77, cueCount: 2, resumed: true }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const progress: Array<{ count: number; phase: string }> = [];

    const result = await uploadVideoWithResume(file, "video/mp4", "auto", api, item => progress.push({ count: item.uploadedChunks, phase: item.phase }));

    expect(result.videoId).toBe(77);
    expect(api.resumePreparePart).toHaveBeenCalledTimes(2);
    expect(api.resumePreparePart).toHaveBeenNthCalledWith(1, { sessionId: "00000000-0000-4000-8000-000000000001", partIndex: 1 });
    expect(api.resumeConfirmPart).toHaveBeenCalledWith(expect.objectContaining({ partIndex: 1, byteSize: 5, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(progress).toEqual([{ count: 1, phase: "uploading" }, { count: 2, phase: "uploading" }, { count: 3, phase: "uploading" }, { count: 3, phase: "uploaded" }]);
    expect(readResumeCheckpoint(file)).toBeNull();
  });

  it("mengirim bagian melalui fallback same-origin ketika PUT langsung gagal", async () => {
    const file = createFile(5);
    const api = {
      resumeInit: vi.fn().mockResolvedValue({ sessionId: "00000000-0000-4000-8000-000000000002", chunkSize: 5, totalChunks: 1, uploadedPartIndexes: [], completedVideoId: null }),
      resumePreparePart: vi.fn().mockResolvedValue({ key: "parts/0", uploadUrl: "https://upload.example/0", partIndex: 0 }),
      resumeConfirmPart: vi.fn(),
      resumeFallbackPart: vi.fn().mockResolvedValue({ usedFallback: true }),
      resumeComplete: vi.fn().mockResolvedValue({ videoId: 78, resumed: false }),
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(uploadVideoWithResume(file, "video/mp4", "auto", api, () => undefined)).resolves.toMatchObject({ videoId: 78 });
    expect(api.resumeFallbackPart).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "00000000-0000-4000-8000-000000000002", partIndex: 0, byteSize: 5, base64: expect.any(String) }));
    expect(api.resumeConfirmPart).not.toHaveBeenCalled();
    expect(readResumeCheckpoint(file)).toBeNull();
    clearResumeCheckpoint(file);
  });

  it("menjaga checkpoint dan menjelaskan pemulihan bila fallback juga gagal", async () => {
    const file = createFile(5);
    const api = {
      resumeInit: vi.fn().mockResolvedValue({ sessionId: "00000000-0000-4000-8000-000000000003", chunkSize: 5, totalChunks: 1, uploadedPartIndexes: [], completedVideoId: null }),
      resumePreparePart: vi.fn().mockResolvedValue({ key: "parts/0", uploadUrl: "https://upload.example/0", partIndex: 0 }),
      resumeConfirmPart: vi.fn(),
      resumeFallbackPart: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      resumeComplete: vi.fn(),
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(uploadVideoWithResume(file, "video/mp4", "auto", api, () => undefined)).rejects.toThrow("Failed to fetch");
    expect(readResumeCheckpoint(file)?.sessionId).toBe("00000000-0000-4000-8000-000000000003");
    expect(videoUploadFailureMessage(new TypeError("Failed to fetch"))).toContain("checkpoint");
  });
});
