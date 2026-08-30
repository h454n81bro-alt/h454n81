export type TranslationBatchResult = {
  finished: boolean;
  translatedCount: number;
  paragraphCount: number;
};

export type UploadedDocument = { documentId: number; paragraphCount: number };

export async function uploadAndTranslate(input: {
  upload: () => Promise<UploadedDocument>;
  translate: (document: UploadedDocument) => Promise<void>;
}) {
  const document = await input.upload();
  await input.translate(document);
  return document;
}

export async function translateUntilComplete(input: {
  documentId: number;
  paragraphCount: number;
  initialCount: number;
  translateBatch: (documentId: number) => Promise<TranslationBatchResult>;
  refresh: () => Promise<void>;
}) {
  let completed = input.initialCount;
  while (completed < input.paragraphCount) {
    const result = await input.translateBatch(input.documentId);
    completed = result.translatedCount;
    await input.refresh();
    if (result.finished) break;
  }
  return completed;
}
