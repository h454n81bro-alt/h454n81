CREATE TABLE `video_upload_parts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`partIndex` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`byteSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_upload_parts_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_upload_parts_session_part_uq` UNIQUE(`sessionId`,`partIndex`)
);
--> statement-breakpoint
CREATE TABLE `video_upload_sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`uploadSourceLanguage` enum('auto','arabic','english','malay','turkish','french','german','spanish','japanese') NOT NULL,
	`totalBytes` int NOT NULL,
	`chunkSize` int NOT NULL,
	`totalChunks` int NOT NULL,
	`uploadStatus` enum('uploading','completed','failed') NOT NULL DEFAULT 'uploading',
	`finalVideoId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_upload_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_upload_sessions_user_updated_idx` ON `video_upload_sessions` (`userId`,`updatedAt`);