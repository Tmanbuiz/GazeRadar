CREATE TABLE `notifications` (
	`owner` text PRIMARY KEY NOT NULL,
	`frequency` text DEFAULT 'off' NOT NULL,
	`no_change` integer DEFAULT 0 NOT NULL,
	`next_digest` integer DEFAULT 0 NOT NULL,
	`sending_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_sent` integer,
	`error` text,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`watch_id` text NOT NULL,
	`category` text NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`fingerprint` text NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `category` text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `emailed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `category` text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `interval_hours` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `next_check` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `email_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `options` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `property_snapshot` text;