CREATE TABLE `auto_trade_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`instrument` varchar(32),
	`decision` enum('BUY','SELL','HOLD','CLOSE','SKIP') NOT NULL,
	`confidence` int,
	`reasoning` text NOT NULL,
	`marketPrice` decimal(12,5),
	`marketContext` json,
	`actionTaken` enum('opened','closed','skipped','blocked_risk','blocked_confidence','error') NOT NULL,
	`actionDetail` text,
	`tradeId` int,
	`pnlRealized` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_trade_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auto_trade_session` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('active','paused','stopped','completed') NOT NULL DEFAULT 'active',
	`mode` enum('paper','live') NOT NULL DEFAULT 'paper',
	`cycleIntervalMinutes` int NOT NULL DEFAULT 15,
	`maxTradesPerSession` int NOT NULL DEFAULT 10,
	`totalTrades` int NOT NULL DEFAULT 0,
	`winningTrades` int NOT NULL DEFAULT 0,
	`sessionPnl` decimal(10,2) NOT NULL DEFAULT '0.00',
	`startBalance` decimal(12,2) NOT NULL DEFAULT '250.00',
	`stopReason` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`stoppedAt` timestamp,
	CONSTRAINT `auto_trade_session_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trades` ADD `autoTradeSessionId` int;