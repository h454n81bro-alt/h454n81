import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIDEO_SUBTITLE_PREFERENCES, persistVideoSubtitlePreferences, readVideoSubtitlePreferences, subtitleOverlayStyle } from "./videoSubtitlePreferences";

describe("video subtitle preferences", () => {
  it("memulihkan preferensi valid dan menolak nilai storage yang tidak aman", () => {
    expect(readVideoSubtitlePreferences({ getItem: () => JSON.stringify({ fontSize: 28, color: "#cc8844", background: "soft", weight: "normal", italic: true }) })).toEqual({ fontSize: 28, color: "#cc8844", background: "soft", weight: "normal", italic: true });
    expect(readVideoSubtitlePreferences({ getItem: () => JSON.stringify({ fontSize: 100, color: "blue" }) })).toEqual(DEFAULT_VIDEO_SUBTITLE_PREFERENCES);
  });

  it("menyimpan preferensi dan menghasilkan style overlay", () => {
    const setItem = vi.fn();
    persistVideoSubtitlePreferences({ ...DEFAULT_VIDEO_SUBTITLE_PREFERENCES, fontSize: 34, background: "transparent" }, { setItem });
    expect(setItem).toHaveBeenCalledOnce();
    expect(subtitleOverlayStyle({ ...DEFAULT_VIDEO_SUBTITLE_PREFERENCES, fontSize: 18, background: "soft", italic: true })).toMatchObject({ fontSize: "18px", fontStyle: "italic", backgroundColor: "rgba(255, 253, 245, 0.82)" });
  });
});
