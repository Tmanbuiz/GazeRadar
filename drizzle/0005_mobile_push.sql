CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`created` integer NOT NULL,
	`cursor_time` integer NOT NULL,
	`cursor_id` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `push_devices_owner` ON `push_devices` (`owner`);