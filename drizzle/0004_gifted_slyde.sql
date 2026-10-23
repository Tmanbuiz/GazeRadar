CREATE INDEX `events_owner_delivery` ON `events` (`owner`,`emailed`,`created`);--> statement-breakpoint
CREATE INDEX `events_watch_owner` ON `events` (`watch_id`,`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_source_url` ON `opportunities` (`owner`,`watch_id`,`url`);--> statement-breakpoint
CREATE INDEX `opportunities_owner_kind` ON `opportunities` (`owner`,`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner_kind` ON `profiles` (`owner`,`kind`);--> statement-breakpoint
CREATE INDEX `watches_due` ON `watches` (`active`,`next_check`);--> statement-breakpoint
CREATE INDEX `watches_owner` ON `watches` (`owner`);