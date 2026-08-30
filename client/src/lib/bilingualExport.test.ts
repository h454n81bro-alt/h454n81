import { describe, expect, it } from "vitest";
import { buildBilingualText } from "./bilingualExport";

describe("buildBilingualText", () => {
  it("mempertahankan urutan Arab di atas terjemahan Indonesia", () => {
    const output = buildBilingualText("Contoh Naskah", [
      { position: 1, arabicText: "بِسْمِ اللَّهِ", indonesianText: "Dengan nama Allah." },
      { position: 2, arabicText: "الْعِلْمُ نُورٌ", indonesianText: "Ilmu adalah cahaya." },
    ]);

    expect(output).toBe(
      "Contoh Naskah\nTerjemahan Arab–Indonesia\n\n1. بِسْمِ اللَّهِ\nDengan nama Allah.\n\n────────────────────────\n\n2. الْعِلْمُ نُورٌ\nIlmu adalah cahaya."
    );
  });

  it("menandai bagian yang belum mempunyai terjemahan", () => {
    expect(
      buildBilingualText("Naskah", [{ position: 1, arabicText: "نَصٌّ", indonesianText: null }])
    ).toContain("[Belum diterjemahkan]");
  });

  it("memberi label Inggris–Indonesia ketika sumbernya berbahasa Inggris", () => {
    expect(
      buildBilingualText("English Book", [{ position: 1, arabicText: "Knowledge is power.", indonesianText: "Pengetahuan adalah kekuatan." }], "english")
    ).toContain("Terjemahan Inggris–Indonesia");
  });

  it("memberi label yang benar untuk seluruh bahasa sumber tambahan", () => {
    const segment = [{ position: 1, arabicText: "Contoh", indonesianText: "Contoh" }];
    expect(buildBilingualText("Kitab", segment, "malay")).toContain("Melayu–Indonesia");
    expect(buildBilingualText("Kitab", segment, "turkish")).toContain("Turki–Indonesia");
    expect(buildBilingualText("Kitab", segment, "french")).toContain("Prancis–Indonesia");
    expect(buildBilingualText("Kitab", segment, "german")).toContain("Jerman–Indonesia");
    expect(buildBilingualText("Kitab", segment, "spanish")).toContain("Spanyol–Indonesia");
    expect(buildBilingualText("Kitab", segment, "japanese")).toContain("Jepang–Indonesia");
  });
});
