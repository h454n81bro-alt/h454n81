import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  documentSegments,
  documents,
  glossaryTerms,
  InsertDocument,
  InsertGlossaryTerm,
  InsertUser,
  InsertVideo,
  users,
  videoCues,
  videoConversionJobs,
  videoNotifications,
  videoUploadParts,
  videoUploadSessions,
  videos,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export type AppliedGlossaryMatch = {
  glossaryTermId: number;
  arabicTerm: string;
  indonesianTerm: string;
  note: string | null;
};

function parseGlossaryMatches(value: string | null): AppliedGlossaryMatch[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AppliedGlossaryMatch =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as AppliedGlossaryMatch).glossaryTermId === "number" &&
        typeof (item as AppliedGlossaryMatch).arabicTerm === "string" &&
        typeof (item as AppliedGlossaryMatch).indonesianTerm === "string"
    );
  } catch {
    return [];
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createDocumentWithSegments(
  document: InsertDocument,
  segments: string[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  return db.transaction(async tx => {
    const result = await tx.insert(documents).values(document);
    const documentId = Number(result[0].insertId);
    if (segments.length > 0) {
      await tx.insert(documentSegments).values(
        segments.map((arabicText, index) => ({
          documentId,
          position: index + 1,
          arabicText,
        }))
      );
    }
    return documentId;
  });
}

export async function listDocumentsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.updatedAt));
}

export async function updateDocumentStatus(documentId: number, status: "uploaded" | "translating" | "translated" | "failed") {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(documents).set({ status }).where(eq(documents.id, documentId));
}

export async function getDocumentForUser(documentId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .limit(1);
  return result[0];
}

export async function getDocumentSegments(documentId: number, page: number, pageSize: number) {
  const db = await getDb();
  if (!db) return [];
  const segments = await db
    .select()
    .from(documentSegments)
    .where(eq(documentSegments.documentId, documentId))
    .orderBy(asc(documentSegments.position))
    .limit(pageSize)
    .offset(page * pageSize);
  return segments.map(segment => ({ ...segment, glossaryMatches: parseGlossaryMatches(segment.glossaryMatches) }));
}

export async function getUntranslatedSegments(documentId: number, limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentSegments)
    .where(and(eq(documentSegments.documentId, documentId), sql`${documentSegments.indonesianText} IS NULL`))
    .orderBy(asc(documentSegments.position))
    .limit(limit);
}

export async function saveTranslations(
  documentId: number,
  translations: Array<{ id: number; translation: string; glossaryMatches: AppliedGlossaryMatch[] }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  for (const item of translations) {
    await db
      .update(documentSegments)
      .set({ indonesianText: item.translation, glossaryMatches: JSON.stringify(item.glossaryMatches) })
      .where(and(eq(documentSegments.id, item.id), eq(documentSegments.documentId, documentId)));
  }
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(documentSegments)
    .where(and(eq(documentSegments.documentId, documentId), sql`${documentSegments.indonesianText} IS NOT NULL`));
  const translatedCount = Number(countResult[0]?.count ?? 0);
  const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const paragraphCount = document[0]?.paragraphCount ?? 0;
  await db
    .update(documents)
    .set({
      translatedCount,
      status: translatedCount >= paragraphCount ? "translated" : "translating",
    })
    .where(eq(documents.id, documentId));
  return { translatedCount, paragraphCount };
}

export async function getAllSegmentsForExport(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  const segments = await db
    .select()
    .from(documentSegments)
    .where(eq(documentSegments.documentId, documentId))
    .orderBy(asc(documentSegments.position));
  return segments.map(segment => ({ ...segment, glossaryMatches: parseGlossaryMatches(segment.glossaryMatches) }));
}

export async function getGlossaryForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(glossaryTerms)
    .where(eq(glossaryTerms.userId, userId))
    .orderBy(asc(glossaryTerms.arabicTerm));
}

export async function createGlossaryTerm(term: InsertGlossaryTerm) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const result = await db.insert(glossaryTerms).values(term);
  return Number(result[0].insertId);
}

export async function updateGlossaryTermForUser(
  id: number,
  userId: number,
  values: Pick<InsertGlossaryTerm, "arabicTerm" | "indonesianTerm" | "note">
) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(glossaryTerms).set(values).where(and(eq(glossaryTerms.id, id), eq(glossaryTerms.userId, userId)));
}

export async function deleteGlossaryTermForUser(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.delete(glossaryTerms).where(and(eq(glossaryTerms.id, id), eq(glossaryTerms.userId, userId)));
}

export async function createVideo(video: InsertVideo) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const result = await db.insert(videos).values(video);
  return Number(result[0].insertId);
}

export async function listVideosForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videos).where(eq(videos.userId, userId)).orderBy(desc(videos.updatedAt));
}

export async function getVideoForUser(videoId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).limit(1);
  return result[0];
}

export async function updateVideo(videoId: number, values: Partial<Pick<InsertVideo, "status" | "audioStorageKey" | "cueCount" | "translatedCount" | "errorMessage" | "durationSeconds" | "translationSummary">>) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(videos).set(values).where(eq(videos.id, videoId));
}

export async function replaceVideoCues(videoId: number, cues: Array<{ startMs: number; endMs: number; sourceText: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.transaction(async tx => {
    await tx.delete(videoCues).where(eq(videoCues.videoId, videoId));
    if (cues.length) {
      await tx.insert(videoCues).values(cues.map((cue, index) => ({ videoId, position: index + 1, ...cue })));
    }
    await tx.update(videos).set({ cueCount: cues.length, translatedCount: 0, status: "transcribed" }).where(eq(videos.id, videoId));
  });
}

export async function getVideoCues(videoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoCues).where(eq(videoCues.videoId, videoId)).orderBy(asc(videoCues.position));
}

export async function saveVideoTranslations(videoId: number, translations: Array<{ id: number; indonesianText: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  for (const translation of translations) {
    await db.update(videoCues).set({ indonesianText: translation.indonesianText }).where(and(eq(videoCues.id, translation.id), eq(videoCues.videoId, videoId)));
  }
  const totalResult = await db.select({ count: sql<number>`count(*)` }).from(videoCues).where(eq(videoCues.videoId, videoId));
  const translatedResult = await db.select({ count: sql<number>`count(*)` }).from(videoCues).where(and(eq(videoCues.videoId, videoId), sql`${videoCues.indonesianText} IS NOT NULL`));
  const cueCount = Number(totalResult[0]?.count ?? 0);
  const translatedCount = Number(translatedResult[0]?.count ?? 0);
  await db.update(videos).set({ cueCount, translatedCount, status: translatedCount >= cueCount ? "translated" : "transcribed" }).where(eq(videos.id, videoId));
  return { cueCount, translatedCount };
}

export async function updateVideoCueTranslation(videoId: number, cueId: number, indonesianText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db
    .update(videoCues)
    .set({ indonesianText })
    .where(and(eq(videoCues.id, cueId), eq(videoCues.videoId, videoId)));
}

export async function getVideoUploadSessionForUser(sessionId: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(videoUploadSessions).where(and(eq(videoUploadSessions.id, sessionId), eq(videoUploadSessions.userId, userId))).limit(1);
  return rows[0];
}

export async function createVideoUploadSession(input: typeof videoUploadSessions.$inferInsert) {
  const existing = await getVideoUploadSessionForUser(input.id, input.userId);
  if (existing) return existing;
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.insert(videoUploadSessions).values(input);
  const created = await getVideoUploadSessionForUser(input.id, input.userId);
  if (!created) throw new Error("Sesi unggah belum dapat dibuat.");
  return created;
}

export async function getVideoUploadParts(sessionId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoUploadParts).where(eq(videoUploadParts.sessionId, sessionId)).orderBy(asc(videoUploadParts.partIndex));
}

export async function saveVideoUploadPart(input: typeof videoUploadParts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.insert(videoUploadParts).values(input).onDuplicateKeyUpdate({ set: { storageKey: input.storageKey, byteSize: input.byteSize, checksum: input.checksum } });
}

export async function completeVideoUploadSession(sessionId: string, userId: number, videoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(videoUploadSessions).set({ status: "completed", finalVideoId: videoId }).where(and(eq(videoUploadSessions.id, sessionId), eq(videoUploadSessions.userId, userId)));
}

export async function createVideoConversionJob(input: typeof videoConversionJobs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const result = await db.insert(videoConversionJobs).values(input);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(videoConversionJobs).where(eq(videoConversionJobs.id, id)).limit(1);
  if (!rows[0]) throw new Error("Job konversi 8K belum dapat dibuat.");
  return rows[0];
}

export async function getLatestVideoConversionJobForUser(videoId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(videoConversionJobs)
    .where(and(eq(videoConversionJobs.videoId, videoId), eq(videoConversionJobs.userId, userId)))
    .orderBy(desc(videoConversionJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createVideoNotification(input: typeof videoNotifications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const result = await db.insert(videoNotifications).values(input);
  return Number(result[0].insertId);
}

export async function listVideoNotificationsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoNotifications).where(eq(videoNotifications.userId, userId)).orderBy(desc(videoNotifications.createdAt)).limit(limit);
}

export async function markVideoNotificationReadForUser(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const result = await db.update(videoNotifications).set({ readAt: new Date() }).where(and(eq(videoNotifications.id, notificationId), eq(videoNotifications.userId, userId)));
  return Number(result[0].affectedRows) > 0;
}
