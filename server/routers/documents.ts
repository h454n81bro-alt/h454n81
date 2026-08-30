import { TRPCError } from "@trpc/server";
import EPub from "epub";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import {
  AppliedGlossaryMatch,
  createDocumentWithSegments,
  getAllSegmentsForExport,
  getDocumentForUser,
  getDocumentSegments,
  getGlossaryForUser,
  getUntranslatedSegments,
  listDocumentsForUser,
  saveTranslations,
  updateDocumentStatus,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { formatGlossaryForPrompt } from "./glossary";
import { storageCreatePresignedPut, storageGetSignedUrl, storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { storageUploadErrorMessage } from "../uploadErrors";

const PAGE_SIZE = 12;
const TRANSLATION_BATCH_SIZE = 8;
export const SOURCE_LANGUAGES = ["arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

export const SOURCE_LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  arabic: "Arab",
  english: "Inggris",
  malay: "Melayu",
  turkish: "Turki",
  french: "Prancis",
  german: "Jerman",
  spanish: "Spanyol",
  japanese: "Jepang",
};

export type UploadMimeType = "application/pdf" | "application/epub+zip" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/plain";

export function validateUpload(fileName: string, mimeType: UploadMimeType, byteLength: number) {
  const lowerName = fileName.toLowerCase();
  const isPdf = mimeType === "application/pdf" && lowerName.endsWith(".pdf");
  const isEpub = mimeType === "application/epub+zip" && lowerName.endsWith(".epub");
  const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && lowerName.endsWith(".docx");
  const isTxt = mimeType === "text/plain" && lowerName.endsWith(".txt");
  if (!isPdf && !isEpub && !isDocx && !isTxt) return "Gunakan dokumen berformat PDF, EPUB, Word DOCX, atau TXT.";
  if (byteLength <= 0) return "Dokumen kosong tidak dapat diproses.";
  return null;
}

export function validateTranslationResponse(
  parsed: { translations: Array<{ id: number; translation: string; glossaryTermIds: number[] }> },
  segmentIds: number[],
  glossary: Array<{ id: number; arabicTerm: string; indonesianTerm: string; note: string | null }>
) {
  const permittedIds = new Set(segmentIds);
  const safeTranslations = parsed.translations
    .filter(
      item =>
        permittedIds.has(item.id) &&
        typeof item.translation === "string" &&
        item.translation.trim().length > 0 &&
        Array.isArray(item.glossaryTermIds)
    )
    .map(item => ({
      id: item.id,
      translation: item.translation,
      glossaryMatches: resolveAppliedGlossaryMatches(item.glossaryTermIds, item.translation, glossary),
    }));
  if (safeTranslations.length !== segmentIds.length) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Sebagian hasil terjemahan belum lengkap. Silakan coba kembali." });
  }
  return safeTranslations;
}

export function normalizeSegments(text: string) {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return cleaned
    .split(/\n\s*\n|\n(?=\s*[\u0600-\u06FF])/)
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(item => item.length > 2 && /[\u0600-\u06FF]/.test(item));
}

export function normalizeNonArabicSegments(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split(/\n\s*\n/)
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(item => item.length > 2 && /[A-Za-zÀ-ÖØ-öø-ÿĞğİıŞşÇçÜüÂâÎîÔô]|[\u3040-\u30FF\u3400-\u9FFF]/.test(item));
}

export function normalizeSegmentsForLanguage(text: string, sourceLanguage: SourceLanguage) {
  return sourceLanguage === "arabic" ? normalizeSegments(text) : normalizeNonArabicSegments(text);
}

export function resolveAppliedGlossaryMatches(
  glossaryTermIds: number[],
  translation: string,
  glossary: Array<{ id: number; arabicTerm: string; indonesianTerm: string; note: string | null }>
): AppliedGlossaryMatch[] {
  const normalizedTranslation = translation.toLocaleLowerCase("id-ID");
  const selectedIds = new Set(glossaryTermIds);
  return glossary
    .filter(term => selectedIds.has(term.id) && normalizedTranslation.includes(term.indonesianTerm.toLocaleLowerCase("id-ID")))
    .map(term => ({
      glossaryTermId: term.id,
      arabicTerm: term.arabicTerm,
      indonesianTerm: term.indonesianTerm,
      note: term.note,
    }));
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractDocxText(buffer: Buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dokumen Word tidak dapat dibaca. Pastikan file berformat DOCX yang valid." });
  }
}

export function epubHtmlToText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export async function extractEpubText(buffer: Buffer) {
  try {
    const epub = new EPub(buffer);
    await epub.parse();
    if (epub.hasDRM()) throw new Error("EPUB dilindungi DRM.");
    const chapters: string[] = [];
    for (const chapter of epub.flow) {
      chapters.push(epubHtmlToText(await epub.getChapter(chapter.id)));
    }
    return chapters.join("\n\n");
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new TRPCError({ code: "BAD_REQUEST", message: `EPUB tidak dapat dibaca atau dilindungi DRM${detail}` });
  }
}

async function ensureOwnedDocument(documentId: number, userId: number) {
  const document = await getDocumentForUser(documentId, userId);
  if (!document) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dokumen tidak ditemukan." });
  }
  return document;
}

function documentUploadKey(userId: number, fileName: string) {
  return `documents/${userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
}

async function readStoredDocument(storageKey: string) {
  const response = await fetch(await storageGetSignedUrl(storageKey));
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Berkas yang diunggah tidak dapat diambil dari penyimpanan. Silakan unggah ulang." });
  return Buffer.from(await response.arrayBuffer());
}

export const documentsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listDocumentsForUser(ctx.user.id)),

  get: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive(), page: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const document = await ensureOwnedDocument(input.documentId, ctx.user.id);
      const segments = await getDocumentSegments(document.id, input.page, PAGE_SIZE);
      return {
        document,
        segments,
        page: input.page,
        pageSize: PAGE_SIZE,
        pageCount: Math.max(1, Math.ceil(document.paragraphCount / PAGE_SIZE)),
      };
    }),

  prepareUpload: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      mimeType: z.enum(["application/pdf", "application/epub+zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const validationError = validateUpload(input.fileName, input.mimeType, 1);
      if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
      try {
        return await storageCreatePresignedPut(documentUploadKey(ctx.user.id, input.fileName));
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
      }
    }),

  finalizeUpload: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      mimeType: z.enum(["application/pdf", "application/epub+zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
      sourceLanguage: z.enum(SOURCE_LANGUAGES),
      storageKey: z.string().min(1).max(1024),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.storageKey.startsWith(`documents/${ctx.user.id}/`)) throw new TRPCError({ code: "FORBIDDEN", message: "Berkas unggahan bukan milik pengguna aktif." });
      const buffer = await readStoredDocument(input.storageKey);
      const validationError = validateUpload(input.fileName, input.mimeType, buffer.length);
      if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
      const extractedText = input.mimeType === "application/pdf"
        ? await extractPdfText(buffer)
        : input.mimeType === "application/epub+zip"
          ? await extractEpubText(buffer)
          : input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ? await extractDocxText(buffer)
            : buffer.toString("utf8");
      const segments = normalizeSegmentsForLanguage(extractedText, input.sourceLanguage);
      if (segments.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Teks ${SOURCE_LANGUAGE_LABELS[input.sourceLanguage]} tidak dapat ditemukan. Pastikan berkas berisi teks yang dapat diekstrak.` });
      const title = input.fileName.replace(/\.[^.]+$/, "").trim() || "Dokumen tanpa judul";
      const documentId = await createDocumentWithSegments({ userId: ctx.user.id, title, originalFileName: input.fileName, mimeType: input.mimeType, sourceLanguage: input.sourceLanguage, storageKey: input.storageKey, paragraphCount: segments.length, status: "translating" }, segments);
      return { documentId, paragraphCount: segments.length };
    }),

  upload: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["application/pdf", "application/epub+zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
        sourceLanguage: z.enum(SOURCE_LANGUAGES),
        base64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const validationError = validateUpload(input.fileName, input.mimeType, buffer.length);
      if (validationError) {
        throw new TRPCError({
          code: validationError.includes("maksimal") ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
          message: validationError,
        });
      }

      const extractedText = input.mimeType === "application/pdf"
        ? await extractPdfText(buffer)
        : input.mimeType === "application/epub+zip"
          ? await extractEpubText(buffer)
          : input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ? await extractDocxText(buffer)
            : buffer.toString("utf8");
      const segments = normalizeSegmentsForLanguage(extractedText, input.sourceLanguage);
      if (segments.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Teks ${SOURCE_LANGUAGE_LABELS[input.sourceLanguage]} tidak dapat ditemukan. Pastikan PDF berisi teks yang dapat diseleksi atau EPUB berisi bab teks, bukan hanya gambar.`,
        });
      }

      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const storageKey = `documents/${ctx.user.id}/${Date.now()}-${safeFileName}`;
      let stored: Awaited<ReturnType<typeof storagePut>>;
      try {
        stored = await storagePut(storageKey, buffer, input.mimeType);
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: storageUploadErrorMessage(error) });
      }
      const title = input.fileName.replace(/\.[^.]+$/, "").trim() || "Dokumen tanpa judul";
      const documentId = await createDocumentWithSegments(
        {
          userId: ctx.user.id,
          title,
          originalFileName: input.fileName,
          mimeType: input.mimeType,
          sourceLanguage: input.sourceLanguage,
          storageKey: stored.key,
          paragraphCount: segments.length,
          status: "translating",
        },
        segments
      );
      return { documentId, paragraphCount: segments.length };
    }),

  markFailed: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureOwnedDocument(input.documentId, ctx.user.id);
      await updateDocumentStatus(input.documentId, "failed");
      return { success: true } as const;
    }),

  translateNext: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const document = await ensureOwnedDocument(input.documentId, ctx.user.id);
      const segments = await getUntranslatedSegments(document.id, TRANSLATION_BATCH_SIZE);
      if (segments.length === 0) {
        return { finished: true, translatedCount: document.translatedCount, paragraphCount: document.paragraphCount };
      }

      const translationRequest = segments
        .map(segment => `ID ${segment.id}: ${segment.arabicText}`)
        .join("\n\n");
      const glossary = document.sourceLanguage === "arabic" ? await getGlossaryForUser(ctx.user.id) : [];
      const glossaryInstructions = formatGlossaryForPrompt(glossary);
      const sourceLanguageLabel = SOURCE_LANGUAGE_LABELS[document.sourceLanguage as SourceLanguage];
      const response = await invokeLLM({
        model: "gpt-5-mini",
        maxTokens: 6000,
        messages: [
          {
            role: "system",
            content:
              `Anda adalah penerjemah profesional ${sourceLanguageLabel} ke Indonesia untuk naskah buku. Terjemahkan secara setia, alami, dan sesuai register teks. Pertahankan nama, kutipan, dan nuansa yang penting; jangan menambah komentar atau ringkasan. ${document.sourceLanguage === "arabic" ? `\n\n${glossaryInstructions}` : ""}\n\nKembalikan JSON yang valid saja.`,
          },
          {
            role: "user",
            content: `Terjemahkan setiap item berikut dari bahasa ${sourceLanguageLabel} ke Indonesia. Keluarkan tepat dengan bentuk {"translations":[{"id":angka,"translation":"teks Indonesia","glossaryTermIds":[angka]}]}. glossaryTermIds berisi ID glosarium yang benar-benar digunakan pada terjemahan bagian tersebut; gunakan array kosong bila tidak ada. Semua ID segmen harus muncul satu kali.\n\n${translationRequest}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "arabic_indonesian_translations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      translation: { type: "string" },
                      glossaryTermIds: { type: "array", items: { type: "integer" } },
                    },
                    required: ["id", "translation", "glossaryTermIds"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message?.content;
      if (typeof content !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Model tidak mengembalikan terjemahan." });
      }
      let parsed: { translations: Array<{ id: number; translation: string; glossaryTermIds: number[] }> };
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Format hasil terjemahan tidak valid." });
      }
      const safeTranslations = validateTranslationResponse(
        parsed,
        segments.map(segment => segment.id),
        glossary
      );
      const result = await saveTranslations(document.id, safeTranslations);
      return {
        finished: result.translatedCount >= result.paragraphCount,
        translatedCount: result.translatedCount,
        paragraphCount: result.paragraphCount,
      };
    }),

  exportData: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const document = await ensureOwnedDocument(input.documentId, ctx.user.id);
      const segments = await getAllSegmentsForExport(document.id);
      return { document, segments };
    }),
});
