import { describe, expect, it } from "vitest";
import { formatGlossaryForPrompt } from "./glossary";

describe("formatGlossaryForPrompt", () => {
  it("menjelaskan bahwa setiap padanan glosarium wajib digunakan", () => {
    const prompt = formatGlossaryForPrompt([
      { arabicTerm: "زكاة", indonesianTerm: "zakat", note: "Gunakan tanpa menerjemahkan menjadi sedekah." },
      { arabicTerm: "صلاة", indonesianTerm: "salat", note: null },
    ]);

    expect(prompt).toContain("GLOSARIUM WAJIB");
    expect(prompt).toContain("Arab: زكاة | Indonesia wajib: zakat");
    expect(prompt).toContain("Catatan: Gunakan tanpa menerjemahkan menjadi sedekah.");
    expect(prompt).toContain("Arab: صلاة | Indonesia wajib: salat");
  });

  it("memberi instruksi netral ketika pengguna belum menyimpan istilah", () => {
    expect(formatGlossaryForPrompt([])).toBe("Tidak ada glosarium khusus yang aktif.");
  });
});
