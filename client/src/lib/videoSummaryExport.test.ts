import { describe, expect, it } from "vitest";
import { createVideoSummaryExport } from "./videoSummaryExport";

describe("video summary export", () => {
  it("membuat TXT dan PDF dari ringkasan terbaru, bukan nilai cache lama", () => {
    const latestSummary = { filenameBase: "kuliah-ringkasan-terjemahan", content: "Ringkasan terbaru setelah subtitle dikoreksi." };
    expect(createVideoSummaryExport(latestSummary, "txt")).toEqual({ filename: "kuliah-ringkasan-terjemahan.txt", content: latestSummary.content, mimeType: "text/plain;charset=utf-8" });
    expect(createVideoSummaryExport(latestSummary, "pdf")).toEqual({ filename: "kuliah-ringkasan-terjemahan.pdf", content: latestSummary.content, mimeType: "application/pdf" });
  });
});
