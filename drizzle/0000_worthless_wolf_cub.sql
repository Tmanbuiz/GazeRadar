CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`watch_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`keywords` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`snapshot` text,
	`checked` integer,
	`created` integer NOT NULL,
	`error` text,
	`checking` integer DEFAULT 0 NOT NULL
);
