export const GLOSSARY_LEGEND = {
  title: "Legenda sorotan",
  label: "Istilah dari glosarium",
  description:
    "Teks berwarna emas dengan garis bawah menandakan padanan Indonesia yang digunakan sesuai glosarium Anda. Lencana di bawah paragraf menunjukkan pasangan istilah Arab dan Indonesia yang diterapkan.",
};

export const GLOSSARY_LEGEND_STORAGE_KEY = "pustaka-terjemah:glossary-legend-open";

type LegendStorage = Pick<Storage, "getItem" | "setItem">;

export function parseGlossaryLegendPreference(value: string | null) {
  return value !== "closed";
}

export function readGlossaryLegendPreference(storage: LegendStorage) {
  try {
    return parseGlossaryLegendPreference(storage.getItem(GLOSSARY_LEGEND_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function persistGlossaryLegendPreference(isOpen: boolean, storage: LegendStorage) {
  try {
    storage.setItem(GLOSSARY_LEGEND_STORAGE_KEY, isOpen ? "open" : "closed");
  } catch {
    // Penyimpanan lokal dapat tidak tersedia pada mode privasi tertentu.
  }
}

export function toggleGlossaryLegend(isOpen: boolean) {
  return !isOpen;
}
