ALTER TABLE `raffles` ADD `reservation_hours` integer DEFAULT 62 NOT NULL;
--> statement-breakpoint
INSERT INTO `reservation_events` (`id`, `raffle_id`, `reservation_id`, `from_status`, `to_status`, `actor`, `note`, `created_at`)
SELECT lower(hex(randomblob(16))), `raffle_id`, `id`, 'pending', 'pending', 'system',
       'Prazo atualizado para 62 horas a partir da criação da reserva', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `reservations`
WHERE `status` = 'pending' AND `payment_reported_at` IS NULL AND `paid_at` IS NULL
  AND `raffle_id` IN (SELECT `id` FROM `raffles` WHERE `status` != 'drawn');
--> statement-breakpoint
UPDATE `reservations`
SET `expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+62 hours')
WHERE `status` = 'pending' AND `payment_reported_at` IS NULL AND `paid_at` IS NULL
  AND `raffle_id` IN (SELECT `id` FROM `raffles` WHERE `status` != 'drawn');
