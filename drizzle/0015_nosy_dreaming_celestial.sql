CREATE TABLE `instrument_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instrument` varchar(32) NOT NULL,
	`bestTradingHours` json,
	`bestTradingDays` json,
	`behaviorPatterns` text,
	`riskFactors` text,
	`recommendedStrategy` text,
	`avgAtr` decimal(12,5),
	`sizeMultiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
	`lifetimePnl` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lifetimeTrades` int NOT NULL DEFAULT 0,
	`bestDirection` varchar(8) NOT NULL DEFAULT 'NEUTRAL',
	`regimePerformance` json,
	`profileSummary` text,
	`version` int NOT NULL DEFAULT 1,
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instrument_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `instrument_profiles_instrument_unique` UNIQUE(`instrument`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_base` (
	`id` int AUTO_INCREMENT NOT NULL,
	`knowledge_type` varchar(32) NOT NULL,
	`subject` varchar(64) NOT NULL DEFAULT 'GLOBAL',
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`confidence` int NOT NULL DEFAULT 50,
	`validations` int NOT NULL DEFAULT 0,
	`contradictions` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'post_trade',
	`tags` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_base_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_regime_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`regime` varchar(32) NOT NULL,
	`instrument` varchar(32) NOT NULL DEFAULT 'GLOBAL',
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10),
	`successfulStrategies` text,
	`failedStrategies` text,
	`keyLessons` text,
	`winRate` decimal(5,2),
	`totalPnl` decimal(12,2),
	`totalTrades` int NOT NULL DEFAULT 0,
	`regimeConfidence` int NOT NULL DEFAULT 70,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_regime_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `lastExternalCashReference` varchar(128);--> statement-breakpoint
ALTER TABLE `risk_settings` ADD `lastExternalCashAt` timestamp;--> statement-breakpoint
ALTER TABLE `schedule_config` ADD `metaAnalysisTaskUid` varchar(65);