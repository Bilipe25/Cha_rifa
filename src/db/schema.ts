import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const raffles = sqliteTable('raffles', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  babyName: text('baby_name').notNull(),
  title: text('title').notNull(),
  themeKey: text('theme_key').notNull(),
  drawDate: text('draw_date').notNull(),
  pricePerNumberCents: integer('price_per_number_cents').notNull(),
  totalNumbers: integer('total_numbers').notNull(),
  prizeOneCents: integer('prize_one_cents').notNull(),
  prizeTwoCents: integer('prize_two_cents').notNull(),
  pixKey: text('pix_key'),
  pixReceiverName: text('pix_receiver_name'),
  pixReceiverCity: text('pix_receiver_city'),
  adminPasswordHash: text('admin_password_hash').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const raffleNumbers = sqliteTable('raffle_numbers', {
  id: text('id').primaryKey(),
  raffleId: text('raffle_id').notNull().references(() => raffles.id),
  number: integer('number').notNull(),
  status: text('status').notNull().default('available'),
  reservationId: text('reservation_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('raffle_number_unique').on(table.raffleId, table.number)]);

export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey(),
  raffleId: text('raffle_id').notNull().references(() => raffles.id),
  participantName: text('participant_name').notNull(),
  phone: text('phone').notNull(),
  phoneNormalized: text('phone_normalized').notNull(),
  status: text('status').notNull().default('pending'),
  totalCents: integer('total_cents').notNull(),
  pixTxid: text('pix_txid').notNull(),
  pixPayload: text('pix_payload').notNull(),
  paymentReportedAt: text('payment_reported_at'),
  paidAt: text('paid_at'),
  cancelledAt: text('cancelled_at'),
  createdAt: text('created_at').notNull(),
});

export const reservationNumbers = sqliteTable('reservation_numbers', {
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  raffleNumberId: text('raffle_number_id').notNull().references(() => raffleNumbers.id),
}, (table) => [uniqueIndex('reservation_number_unique').on(table.reservationId, table.raffleNumberId)]);

export const draws = sqliteTable('draws', {
  id: text('id').primaryKey(),
  raffleId: text('raffle_id').notNull().references(() => raffles.id),
  prizePosition: integer('prize_position').notNull(),
  prizeLabel: text('prize_label').notNull(),
  winningNumber: integer('winning_number').notNull(),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('raffle_draw_position_unique').on(table.raffleId, table.prizePosition)]);
