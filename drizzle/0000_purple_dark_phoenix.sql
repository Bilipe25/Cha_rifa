CREATE TABLE `draws` (
	`id` text PRIMARY KEY NOT NULL,
	`raffle_id` text NOT NULL,
	`prize_position` integer NOT NULL,
	`prize_label` text NOT NULL,
	`winning_number` integer NOT NULL,
	`reservation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`raffle_id`) REFERENCES `raffles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raffle_draw_position_unique` ON `draws` (`raffle_id`,`prize_position`);--> statement-breakpoint
CREATE TABLE `raffle_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`raffle_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`reservation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`raffle_id`) REFERENCES `raffles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raffle_number_unique` ON `raffle_numbers` (`raffle_id`,`number`);--> statement-breakpoint
CREATE TABLE `raffles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`baby_name` text NOT NULL,
	`title` text NOT NULL,
	`theme_key` text NOT NULL,
	`draw_date` text NOT NULL,
	`price_per_number_cents` integer NOT NULL,
	`total_numbers` integer NOT NULL,
	`prize_one_cents` integer NOT NULL,
	`prize_two_cents` integer NOT NULL,
	`pix_key` text,
	`pix_receiver_name` text,
	`pix_receiver_city` text,
	`admin_password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raffles_slug_unique` ON `raffles` (`slug`);--> statement-breakpoint
CREATE TABLE `reservation_numbers` (
	`reservation_id` text NOT NULL,
	`raffle_number_id` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raffle_number_id`) REFERENCES `raffle_numbers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_number_unique` ON `reservation_numbers` (`reservation_id`,`raffle_number_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`raffle_id` text NOT NULL,
	`participant_name` text NOT NULL,
	`phone` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_cents` integer NOT NULL,
	`pix_txid` text NOT NULL,
	`pix_payload` text NOT NULL,
	`payment_reported_at` text,
	`paid_at` text,
	`cancelled_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`raffle_id`) REFERENCES `raffles`(`id`) ON UPDATE no action ON DELETE no action
);
