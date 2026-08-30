CREATE TABLE `document_segments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`position` int NOT NULL,
	`arabicText` text NOT NULL,
	`indonesianText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_segments_id` PRIMARY KEY(`id`),
	CONSTRAINT `segments_document_position_uq` UNIQUE(`documentId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`originalFileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`paragraphCount` int NOT NULL DEFAULT 0,
	`translatedCount` int NOT NULL DEFAULT 0,
	`status` enum('uploaded','translating','translated','failed') NOT NULL DEFAULT 'uploaded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `segments_document_position_idx` ON `document_segments` (`documentId`,`position`);--> statement-breakpoint
CREATE INDEX `documents_user_created_idx` ON `documents` (`userId`,`createdAt`);