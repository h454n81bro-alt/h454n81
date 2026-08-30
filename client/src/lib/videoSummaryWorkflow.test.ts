import { describe, expect, it, vi } from "vitest";
import { persistSubtitleCorrection, refetchLatestVideoSummaryExport } from "./videoSummaryWorkflow";

describe("video summary workflow", () => {
  it("menyimpan koreksi, menyegarkan cache, lalu mengekspor ringkasan terbaru sebagai TXT dan PDF", async () => {
    const sequence: string[] = [];
    const submitCorrection = vi.fn(async () => { sequence.push("update-cue"); });
    const refresh = vi.fn(async () => { sequence.push("invalidate-summary"); });
    const refetchSummary = vi.fn(async () => {
      sequence.push("refetch-summary");
      return { data: { filenameBase: "video-ringkasan", content: "Ringkasan baru setelah koreksi subtitle." } };
    });

    await persistSubtitleCorrection(submitCorrection, refresh);
    const txt = await refetchLatestVideoSummaryExport("txt", refetchSummary);
    const pdf = await refetchLatestVideoSummaryExport("pdf", refetchSummary);

    expect(sequence).toEqual(["update-cue", "invalidate-summary", "refetch-summary", "refetch-summary"]);
    expect(txt).toMatchObject({ filename: "video-ringkasan.txt", content: "Ringkasan baru setelah koreksi subtitle." });
    expect(pdf).toMatchObject({ filename: "video-ringkasan.pdf", content: "Ringkasan baru setelah koreksi subtitle." });
  });
});
