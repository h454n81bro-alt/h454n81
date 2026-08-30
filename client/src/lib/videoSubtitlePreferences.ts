export type VideoSubtitlePreferences = {
  fontSize: number;
  color: string;
  background: "dark" | "soft" | "transparent";
  weight: "normal" | "bold";
  italic: boolean;
};

export const DEFAULT_VIDEO_SUBTITLE_PREFERENCES: VideoSubtitlePreferences = {
  fontSize: 22,
  color: "#ffffff",
  background: "dark",
  weight: "bold",
  italic: false,
};

const STORAGE_KEY = "pustaka-video-subtitle-preferences-v1";

export function readVideoSubtitlePreferences(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage): VideoSubtitlePreferences {
  if (!storage) return DEFAULT_VIDEO_SUBTITLE_PREFERENCES;
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (!value) return DEFAULT_VIDEO_SUBTITLE_PREFERENCES;
    const parsed = JSON.parse(value) as Partial<VideoSubtitlePreferences>;
    return {
      fontSize: typeof parsed.fontSize === "number" && [18, 22, 28, 34].includes(parsed.fontSize) ? parsed.fontSize : DEFAULT_VIDEO_SUBTITLE_PREFERENCES.fontSize,
      color: typeof parsed.color === "string" && /^#[0-9a-f]{6}$/i.test(parsed.color) ? parsed.color : DEFAULT_VIDEO_SUBTITLE_PREFERENCES.color,
      background: parsed.background === "soft" || parsed.background === "transparent" ? parsed.background : "dark",
      weight: parsed.weight === "normal" ? "normal" : "bold",
      italic: Boolean(parsed.italic),
    };
  } catch {
    return DEFAULT_VIDEO_SUBTITLE_PREFERENCES;
  }
}

export function persistVideoSubtitlePreferences(preferences: VideoSubtitlePreferences, storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferensi bersifat opsional; pemutar video tetap berjalan ketika storage tidak tersedia.
  }
}

export function subtitleOverlayStyle(preferences: VideoSubtitlePreferences) {
  const backgroundColor = preferences.background === "dark" ? "rgba(8, 21, 18, 0.82)" : preferences.background === "soft" ? "rgba(255, 253, 245, 0.82)" : "transparent";
  return {
    color: preferences.color,
    backgroundColor,
    fontSize: `${preferences.fontSize}px`,
    fontWeight: preferences.weight,
    fontStyle: preferences.italic ? "italic" : "normal",
  } as const;
}
