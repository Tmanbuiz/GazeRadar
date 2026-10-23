ALTER TABLE `watches` ADD `last_ok` integer;--> statement-breakpoint
ALTER TABLE `watches` ADD `fail_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `watches` SET `last_ok` = `checked` WHERE `snapshot` IS NOT NULL AND `error` IS NULL AND `checked` IS NOT NULL;
