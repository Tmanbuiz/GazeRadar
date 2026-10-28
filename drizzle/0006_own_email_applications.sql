CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`recipient` text NOT NULL,
	`sender` text NOT NULL,
	`title` text NOT NULL,
	`job_url` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_owner_created` ON `applications` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `mail_accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`refresh` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_oauth` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
