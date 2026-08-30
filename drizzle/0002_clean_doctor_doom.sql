CREATE TABLE `glossary_terms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`arabicTerm` varchar(500) NOT NULL,
	`indonesianTerm` varchar(500) NOT NULL,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `glossary_terms_id` PRIMARY KEY(`id`),
	CONSTRAINT `glossary_user_arabic_uq` UNIQUE(`userId`,`arabicTerm`)
);
--> statement-breakpoint
CREATE INDEX `glossary_user_created_idx` ON `glossary_terms` (`userId`,`createdAt`);