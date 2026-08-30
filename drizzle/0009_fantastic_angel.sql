CREATE TABLE `video_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`videoId` int,
	`kind` enum('uploaded','processing','translated','failed') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` varchar(500) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_notifications_user_created_idx` ON `video_notifications` (`userId`,`createdAt`);