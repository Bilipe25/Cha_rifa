CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`raffle_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`raffle_id`) REFERENCES `raffles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `raffles` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `raffles` ADD `drawn_at` text;--> statement-breakpoint
ALTER TABLE `raffles` ADD `session_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `late_payment_reported_at` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `cancel_reason` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `expires_at` text;