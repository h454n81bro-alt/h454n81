import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { epubHtmlToText, extractDocxText, extractEpubText, normalizeSegments, normalizeSegmentsForLanguage, resolveAppliedGlossaryMatches, SOURCE_LANGUAGES, validateTranslationResponse, validateUpload } from "./documents";

async function createMinimalEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="utf-8"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Kitab Uji</dc:title><dc:language>ar</dc:language></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`);
  zip.file("OEBPS/chapter-1.xhtml", "<html><body><h1>عنوان</h1><p>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p></body></html>");
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createMinimalDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Knowledge is power.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("validateUpload", () => {
  it("menerima PDF, EPUB, DOCX, dan TXT tanpa batas ukuran aplikasi", () => {
    expect(validateUpload("kitab.pdf", "application/pdf", 1024)).toBeNull();
    expect(validateUpload("kitab.epub", "application/epub+zip", 1024)).toBeNull();
    expect(validateUpload("naskah.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1024)).toBeNull();
    expect(validateUpload("naskah.txt", "text/plain", 1024)).toBeNull();
  });

  it("menolak format asing dan dokumen kosong", () => {
    expect(validateUpload("kitab.docx", "application/epub+zip", 1024)).toContain("PDF, EPUB, Word DOCX, atau TXT");
    expect(validateUpload("kitab.epub", "application/epub+zip", 2 * 1024 * 1024 * 1024)).toBeNull();
    expect(validateUpload("kosong.epub", "application/epub+zip", 0)).toContain("kosong");
  });
});

describe("extractDocxText", () => {
  it("mengekstrak paragraf dari Word DOCX minimal", async () => {
    await expect(extractDocxText(await createMinimalDocx())).resolves.toContain("Knowledge is power.");
  });
});

describe("epubHtmlToText", () => {
  it("menghapus markup EPUB dan mempertahankan teks Arab antarparagraf", () => {
    expect(epubHtmlToText("<h1>عنوان</h1><p>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p><script>ignore()</script>")).toContain("بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ");
  });

  it("mengekstrak teks Arab dari struktur EPUB minimal", async () => {
    await expect(extractEpubText(await createMinimalEpub())).resolves.toContain("بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ");
  });
});

describe("validateTranslationResponse", () => {
  it("menolak respons LLM yang tidak mencakup semua segmen", () => {
    expect(() => validateTranslationResponse(
      { translations: [{ id: 1, translation: "Terjemahan pertama", glossaryTermIds: [] }] },
      [1, 2],
      []
    )).toThrow("Sebagian hasil terjemahan belum lengkap");
  });
});

describe("normalizeSegments", () => {
  it("memisahkan paragraf Arab dan mengabaikan baris non-Arab", () => {
    const result = normalizeSegments(`Judul naskah\n\nبِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ\n\nإِنَّ الْعِلْمَ نُورٌ، وَالْجَهْلَ ظُلْمَةٌ.`);

    expect(result).toEqual([
      "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
      "إِنَّ الْعِلْمَ نُورٌ، وَالْجَهْلَ ظُلْمَةٌ.",
    ]);
  });

  it("menolak isi tanpa teks Arab sebagai hasil kosong", () => {
    expect(normalizeSegments("A scanned book with no selectable text")).toEqual([]);
  });

  it("merapikan spasi sebelum menyimpan segmen", () => {
    const result = normalizeSegments("  هَذَا   نَصٌّ   عَرَبِيٌّ  \n\n  وَهَذِهِ فِقْرَةٌ ثَانِيَةٌ  ");

    expect(result).toEqual(["هَذَا نَصٌّ عَرَبِيٌّ", "وَهَذِهِ فِقْرَةٌ ثَانِيَةٌ"]);
  });

  it("menyimpan hanya istilah glosarium yang benar-benar diterapkan pada terjemahan", () => {
    const applied = resolveAppliedGlossaryMatches(
      [1, 2],
      "Zakat merupakan kewajiban sosial dalam Islam.",
      [
        { id: 1, arabicTerm: "زكاة", indonesianTerm: "zakat", note: "Gunakan bentuk baku." },
        { id: 2, arabicTerm: "صلاة", indonesianTerm: "salat", note: null },
      ]
    );

    expect(applied).toEqual([
      { glossaryTermId: 1, arabicTerm: "زكاة", indonesianTerm: "zakat", note: "Gunakan bentuk baku." },
    ]);
  });
});

describe("normalizeSegmentsForLanguage", () => {
  it("mempertahankan paragraf Inggris dan mengabaikan fragmen tanpa huruf", () => {
    expect(normalizeSegmentsForLanguage("First English paragraph.\n\nSecond paragraph!\n\n123", "english")).toEqual([
      "First English paragraph.",
      "Second paragraph!",
    ]);
  });

  it("memilih normalisasi Arab saat bahasa sumber Arab", () => {
    expect(normalizeSegmentsForLanguage("بِسْمِ اللَّهِ", "arabic")).toEqual(["بِسْمِ اللَّهِ"]);
  });

  it("mendukung seluruh pilihan bahasa sumber ke Indonesia", () => {
    expect(SOURCE_LANGUAGES).toEqual(["arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"]);
    const samples = {
      malay: "Ilmu adalah cahaya.",
      turkish: "Bilgi güçtür.",
      french: "La connaissance est une force.",
      german: "Wissen ist Macht.",
      spanish: "El conocimiento es poder.",
      japanese: "知識は力です。",
    } as const;
    for (const [language, text] of Object.entries(samples)) {
      expect(normalizeSegmentsForLanguage(text, language as Exclude<typeof SOURCE_LANGUAGES[number], "arabic" | "english">)).toEqual([text]);
    }
  });
});
