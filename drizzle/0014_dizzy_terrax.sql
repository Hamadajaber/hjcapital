CREATE TABLE `instrument_performance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instrument` varchar(32) NOT NULL,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`totalTrades` int NOT NULL DEFAULT 0,
	`totalPnl` decimal(12,2) NOT NULL DEFAULT '0.00',
	`avgPnl` decimal(10,2) NOT NULL DEFAULT '0.00',
	`winRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`score` int NOT NULL DEFAULT 50,
	`aiAnalysis` text,
	`recommendedConfidence` int,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastTradeAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instrument_performance_id` PRIMARY KEY(`id`),
	CONSTRAINT `instrument_performance_instrument_unique` UNIQUE(`instrument`)
);
--> statement-breakpoint
CREATE TABLE `strategy_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adjustmentType` varchar(64) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`reasoning` text NOT NULL,
	`tradesAnalyzed` int NOT NULL DEFAULT 0,
	`lessonsRead` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'weekly_meta',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategy_adjustments_id` PRIMARY KEY(`id`)
);
