CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`balance` decimal(12,2) NOT NULL DEFAULT '250.00',
	`initialBalance` decimal(12,2) NOT NULL DEFAULT '250.00',
	`mode` enum('paper','live') NOT NULL DEFAULT 'paper',
	`capitalApiKey` varchar(256),
	`capitalEmail` varchar(320),
	`capitalPassword` varchar(256),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dailyLossLimit` decimal(8,2) NOT NULL DEFAULT '7.50',
	`dailyProfitLock` decimal(8,2) NOT NULL DEFAULT '10.00',
	`maxRiskPerTrade` decimal(5,2) NOT NULL DEFAULT '1.00',
	`minConfidenceThreshold` int NOT NULL DEFAULT 72,
	`maxOpenPositions` int NOT NULL DEFAULT 3,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risk_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instrument` varchar(32) NOT NULL,
	`signal` enum('BUY','SELL','HOLD') NOT NULL,
	`confidence` int NOT NULL,
	`reasoning` text NOT NULL,
	`currentPrice` decimal(12,5),
	`targetPrice` decimal(12,5),
	`stopLoss` decimal(12,5),
	`indicators` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instrument` varchar(32) NOT NULL,
	`direction` enum('BUY','SELL') NOT NULL,
	`openPrice` decimal(12,5) NOT NULL,
	`closePrice` decimal(12,5),
	`size` decimal(10,4) NOT NULL,
	`pnl` decimal(10,2),
	`status` enum('open','closed','cancelled') NOT NULL DEFAULT 'open',
	`aiReasoning` text,
	`aiConfidence` int,
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`mode` enum('paper','live') NOT NULL DEFAULT 'paper',
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
