CREATE TABLE `engine_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dynamicConfidenceThreshold` int NOT NULL DEFAULT 72,
	`marketRegimes` json,
	`winRate7d` decimal(5,2) NOT NULL DEFAULT '0.00',
	`trades7d` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engine_intelligence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeId` int,
	`instrument` varchar(32) NOT NULL,
	`direction` enum('BUY','SELL') NOT NULL,
	`entryPrice` decimal(12,5),
	`exitPrice` decimal(12,5),
	`pnl` decimal(10,2),
	`wasCorrect` boolean NOT NULL DEFAULT false,
	`aiVerdict` text NOT NULL,
	`lessonText` text NOT NULL,
	`marketConditions` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trade_lessons_id` PRIMARY KEY(`id`)
);
