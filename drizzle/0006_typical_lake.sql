CREATE TABLE `video_cues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoId` int NOT NULL,
	`position` int NOT NULL,
	`startMs` int NOT NULL,
	`endMs` int NOT NULL,
	`sourceText` text NOT NULL,
	`indonesianText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_cues_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_cues_video_position_uq` UNIQUE(`videoId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`originalFileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`sourceType` enum('upload','public_url') NOT NULL DEFAULT 'upload',
	`publicSourceUrl` varchar(2048),
	`storageKey` varchar(512) NOT NULL,
	`audioStorageKey` varchar(512),
	`videoSourceLanguage` enum('auto','arabic','english','malay','turkish','french','german','spanish','japanese') NOT NULL DEFAULT 'auto',
	`durationSeconds` int,
	`cueCount` int NOT NULL DEFAULT 0,
	`translatedCount` int NOT NULL DEFAULT 0,
	`videoStatus` enum('uploaded','processing','transcribed','translated','failed') NOT NULL DEFAULT 'uploaded',
	`errorMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_cues_video_timing_idx` ON `video_cues` (`videoId`,`startMs`);--> statement-breakpoint
CREATE INDEX `videos_user_created_idx` ON `videos` (`userId`,`createdAt`);