export type BilingualExportSegment = {
  position: number;
  arabicText: string;
  indonesianText: string | null;
};

export type ExportSourceLanguage = "arabic" | "english" | "malay" | "turkish" | "french" | "german" | "spanish" | "japanese";

const SOURCE_LABELS: Record<ExportSourceLanguage, string> = {
  arabic: "Arab",
  english: "Inggris",
  malay: "Melayu",
  turkish: "Turki",
  french: "Prancis",
  german: "Jerman",
  spanish: "Spanyol",
  japanese: "Jepang",
};

export function buildBilingualText(
  title: string,
  segments: BilingualExportSegment[],
  sourceLanguage: ExportSourceLanguage = "arabic"
) {
  const body = segments
    .map(
      segment =>
        `${segment.position}. ${segment.arabicText}\n${segment.indonesianText || "[Belum diterjemahkan]"}`
    )
    .join("\n\n────────────────────────\n\n");

  const sourceLabel = SOURCE_LABELS[sourceLanguage];
  return `${title}\nTerjemahan ${sourceLabel}–Indonesia\n\n${body}`;
}
