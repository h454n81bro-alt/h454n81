import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }).notNull(),
    sourceLanguage: mysqlEnum("sourceLanguage", ["arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"])
      .notNull()
      .default("arabic"),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    paragraphCount: int("paragraphCount").notNull().default(0),
    translatedCount: int("translatedCount").notNull().default(0),
    status: mysqlEnum("status", ["uploaded", "translating", "translated", "failed"])
      .notNull()
      .default("uploaded"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userCreatedIndex: index("documents_user_created_idx").on(table.userId, table.createdAt),
  })
);

export const documentSegments = mysqlTable(
  "document_segments",
  {
    id: int("id").autoincrement().primaryKey(),
    documentId: int("documentId").notNull(),
    position: int("position").notNull(),
    arabicText: text("arabicText").notNull(),
    indonesianText: text("indonesianText"),
    glossaryMatches: text("glossaryMatches"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    documentPositionUnique: uniqueIndex("segments_document_position_uq").on(
      table.documentId,
      table.position
    ),
    documentPositionIndex: index("segments_document_position_idx").on(
      table.documentId,
      table.position
    ),
  })
);

export const glossaryTerms = mysqlTable(
  "glossary_terms",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    arabicTerm: varchar("arabicTerm", { length: 500 }).notNull(),
    indonesianTerm: varchar("indonesianTerm", { length: 500 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userArabicTermUnique: uniqueIndex("glossary_user_arabic_uq").on(table.userId, table.arabicTerm),
    userCreatedIndex: index("glossary_user_created_idx").on(table.userId, table.createdAt),
  })
);

export const videos = mysqlTable(
  "videos",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }).notNull(),
    sourceType: mysqlEnum("sourceType", ["upload", "public_url"]).notNull().default("upload"),
    publicSourceUrl: varchar("publicSourceUrl", { length: 2048 }),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    audioStorageKey: varchar("audioStorageKey", { length: 512 }),
    sourceLanguage: mysqlEnum("videoSourceLanguage", ["auto", "arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"])
      .notNull()
      .default("auto"),
    durationSeconds: int("durationSeconds"),
    cueCount: int("cueCount").notNull().default(0),
    translatedCount: int("translatedCount").notNull().default(0),
    translationSummary: text("translationSummary"),
    status: mysqlEnum("videoStatus", ["uploaded", "processing", "transcribed", "translated", "failed"])
      .notNull()
      .default("uploaded"),
    errorMessage: varchar("errorMessage", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userCreatedIndex: index("videos_user_created_idx").on(table.userId, table.createdAt),
  })
);

export const videoCues = mysqlTable(
  "video_cues",
  {
    id: int("id").autoincrement().primaryKey(),
    videoId: int("videoId").notNull(),
    position: int("position").notNull(),
    startMs: int("startMs").notNull(),
    endMs: int("endMs").notNull(),
    sourceText: text("sourceText").notNull(),
    indonesianText: text("indonesianText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    videoPositionUnique: uniqueIndex("video_cues_video_position_uq").on(table.videoId, table.position),
    videoTimingIndex: index("video_cues_video_timing_idx").on(table.videoId, table.startMs),
  })
);

export const videoUploadSessions = mysqlTable(
  "video_upload_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }).notNull(),
    sourceLanguage: mysqlEnum("uploadSourceLanguage", ["auto", "arabic", "english", "malay", "turkish", "french", "german", "spanish", "japanese"]).notNull(),
    totalBytes: int("totalBytes").notNull(),
    chunkSize: int("chunkSize").notNull(),
    totalChunks: int("totalChunks").notNull(),
    status: mysqlEnum("uploadStatus", ["uploading", "completed", "failed"]).notNull().default("uploading"),
    finalVideoId: int("finalVideoId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userUpdatedIndex: index("video_upload_sessions_user_updated_idx").on(table.userId, table.updatedAt) })
);

export const videoUploadParts = mysqlTable(
  "video_upload_parts",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: varchar("sessionId", { length: 64 }).notNull(),
    partIndex: int("partIndex").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    byteSize: int("byteSize").notNull(),
    checksum: varchar("checksum", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ sessionPartUnique: uniqueIndex("video_upload_parts_session_part_uq").on(table.sessionId, table.partIndex) })
);

export const videoConversionJobs = mysqlTable(
  "video_conversion_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    videoId: int("videoId").notNull(),
    targetWidth: int("targetWidth").notNull().default(7680),
    targetHeight: int("targetHeight").notNull().default(4320),
    status: mysqlEnum("conversionStatus", ["queued", "processing", "completed", "failed", "cancelled"]).notNull().default("queued"),
    progressPercent: int("progressPercent").notNull().default(0),
    outputStorageKey: varchar("outputStorageKey", { length: 512 }),
    errorMessage: varchar("errorMessage", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userVideoCreatedIndex: index("video_conversion_jobs_user_video_created_idx").on(table.userId, table.videoId, table.createdAt),
  })
);

export const videoNotifications = mysqlTable(
  "video_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    videoId: int("videoId"),
    kind: mysqlEnum("kind", ["uploaded", "processing", "translated", "failed"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ userCreatedIndex: index("video_notifications_user_created_idx").on(table.userId, table.createdAt) })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type DocumentSegment = typeof documentSegments.$inferSelect;
export type InsertDocumentSegment = typeof documentSegments.$inferInsert;
export type GlossaryTerm = typeof glossaryTerms.$inferSelect;
export type InsertGlossaryTerm = typeof glossaryTerms.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;
export type VideoCue = typeof videoCues.$inferSelect;
export type InsertVideoCue = typeof videoCues.$inferInsert;
export type VideoUploadSession = typeof videoUploadSessions.$inferSelect;
export type InsertVideoUploadSession = typeof videoUploadSessions.$inferInsert;
export type VideoUploadPart = typeof videoUploadParts.$inferSelect;
export type VideoNotification = typeof videoNotifications.$inferSelect;
export type InsertVideoNotification = typeof videoNotifications.$inferInsert;
