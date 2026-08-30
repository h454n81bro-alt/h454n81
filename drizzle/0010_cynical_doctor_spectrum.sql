CREATE TABLE `video_conversion_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`videoId` int NOT NULL,
	`targetWidth` int NOT NULL DEFAULT 7680,
	`targetHeight` int NOT NULL DEFAULT 4320,
	`conversionStatus` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`progressPercent` int NOT NULL DEFAULT 0,
	`outputStorageKey` varchar(512),
	`errorMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_conversion_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_conversion_jobs_user_video_created_idx` ON `video_conversion_jobs` (`userId`,`videoId`,`createdAt`);