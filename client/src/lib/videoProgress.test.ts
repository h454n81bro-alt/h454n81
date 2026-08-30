import { describe, expect, it } from "vitest";
import { advanceProgress, summaryProgressFor, videoProgressFor } from "./videoProgress";

describe("video progress", () => {
  it("menyediakan fase pemrosesan yang dapat dipahami pengguna", () => {
    expect(videoProgressFor("reading")).toMatchObject({ label: "Membaca video", percent: 12 });
    expect(videoProgressFor("transcribing")).toMatchObject({ label: "Mentranskripsikan audio", percent: 42 });
    expect(videoProgressFor("translating")).toMatchObject({ label: "Menerjemahkan subtitle", percent: 76 });
    expect(videoProgressFor("complete").percent).toBe(100);
  });

  it("membedakan loading ringkasan dari ringkasan siap", () => {
    expect(summaryProgressFor(true).percent).toBeLessThan(100);
    expect(summaryProgressFor(false).label).toBe("Ringkasan siap");
  });

  it("tidak mengklaim progres tak tentu sudah selesai", () => {
    expect(advanceProgress(88)).toBe(92);
    expect(advanceProgress(99)).toBe(92);
  });
});
