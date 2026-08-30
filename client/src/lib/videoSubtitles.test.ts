import { describe, expect, it } from "vitest";
import { activeCueId, createIndonesianVtt } from "./videoSubtitles";

const cues = [
  { id: 1, position: 1, startMs: 0, endMs: 1500, sourceText: "Hello", indonesianText: "Halo" },
  { id: 2, position: 2, startMs: 1500, endMs: 3000, sourceText: "World", indonesianText: "Dunia" },
];

describe("video subtitles", () => {
  it("membuat WebVTT Indonesia dari cue subtitle", () => {
    expect(createIndonesianVtt(cues)).toContain("00:00:00.000 --> 00:00:01.500\nHalo");
  });

  it("menentukan cue aktif dari waktu video", () => {
    expect(activeCueId(cues, 0.5)).toBe(1);
    expect(activeCueId(cues, 1.5)).toBe(2);
    expect(activeCueId(cues, 4)).toBeNull();
  });
});
