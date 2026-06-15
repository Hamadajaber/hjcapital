CREATE TABLE `price_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instrument` varchar(32) NOT NULL,
	`targetPrice` decimal(12,5) NOT NULL,
	`condition` enum('above','below') NOT NULL,
	`note` text,
	`triggered` boolean NOT NULL DEFAULT false,
	`triggeredAt` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_alerts_id` PRIMARY KEY(`id`)
);
