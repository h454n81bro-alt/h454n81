import { describe, expect, it } from "vitest";
import {
  GLOSSARY_LEGEND,
  GLOSSARY_LEGEND_STORAGE_KEY,
  parseGlossaryLegendPreference,
  persistGlossaryLegendPreference,
  readGlossaryLegendPreference,
  toggleGlossaryLegend,
} from "./glossaryLegend";

describe("glossary legend", () => {
  it("membalik status panel ketika pengguna menekan tombol legenda", () => {
    expect(toggleGlossaryLegend(true)).toBe(false);
    expect(toggleGlossaryLegend(false)).toBe(true);
  });

  it("menyediakan deskripsi yang menjelaskan makna sorotan", () => {
    expect(GLOSSARY_LEGEND.title).toBe("Legenda sorotan");
    expect(GLOSSARY_LEGEND.description).toContain("glosarium");
  });

  it("menyimpan dan memulihkan preferensi terbuka atau tertutup", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    };

    persistGlossaryLegendPreference(false, storage);
    expect(memory.get(GLOSSARY_LEGEND_STORAGE_KEY)).toBe("closed");
    expect(readGlossaryLegendPreference(storage)).toBe(false);

    persistGlossaryLegendPreference(true, storage);
    expect(readGlossaryLegendPreference(storage)).toBe(true);
    expect(parseGlossaryLegendPreference(null)).toBe(true);
  });
});
