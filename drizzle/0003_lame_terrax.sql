CREATE TABLE `schedule_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`defaultMode` enum('paper','live') NOT NULL DEFAULT 'paper',
	`cycleIntervalMinutes` int NOT NULL DEFAULT 15,
	`startTaskUid` varchar(65),
	`stopTaskUid` varchar(65),
	`startCron` varchar(64) DEFAULT '0 7 * * 1-5',
	`stopCron` varchar(64) DEFAULT '0 20 * * 1-5',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_config_id` PRIMARY KEY(`id`)
);
