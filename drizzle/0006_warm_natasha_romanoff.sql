ALTER TABLE `trades` ADD `stopLoss` decimal(12,5);--> statement-breakpoint
ALTER TABLE `trades` ADD `takeProfit` decimal(12,5);--> statement-breakpoint
ALTER TABLE `trades` ADD `createdAt` timestamp DEFAULT (now()) NOT NULL;