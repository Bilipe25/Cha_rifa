import 'server-only';

import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { client, db } from '@/db';

import { raffleNumbers, reservationNumbers, reservations } from '@/db/schema';

import { createPixPayload } from '@/lib/pix';

import { formatPhone, normalizePhone } from '@/lib/phone';

import { expirePendingReservations } from './lifecycle';

import { getRaffle } from './queries';

import { MAX_NUMBERS_PER_RESERVATION, PixUnavailableError, RaffleClosedError, reservationDeadline, UnavailableNumbersError } from './shared';
import { privateFingerprint, RateLimitError } from '@/lib/rate-limit';

export class PriceChangedError extends Error {
  constructor(public priceCents: number) { super('O preço de cada número mudou. Confira o novo total antes de reservar.'); }
}

export async function createReservation(slug: string, numbers: number[], participantName: string, phone: string, expectedPriceCents?: number) {
  const raffle = await getRaffle(slug);
  if (!raffle || raffle.status !== 'active') throw new RaffleClosedError();
  if (!raffle.pixKey || !raffle.pixReceiverName || !raffle.pixReceiverCity) throw new PixUnavailableError();
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);
  if (!uniqueNumbers.length || uniqueNumbers.length > MAX_NUMBERS_PER_RESERVATION || uniqueNumbers.length !== numbers.length || uniqueNumbers.some(n => !Number.isInteger(n) || n < 1 || n > raffle.totalNumbers)) {
    throw new Error('Números inválidos');
  }
  const id = randomUUID();
  const txid = randomUUID().replace(/-/g, '').slice(0, 25).toUpperCase();
  const now = new Date().toISOString();
  await expirePendingReservations(raffle.id);
  const transaction = await client.transaction('write');
  try {
    const current = await transaction.execute({
      sql: 'SELECT status, total_numbers, price_per_number_cents, pix_key, pix_receiver_name, pix_receiver_city FROM raffles WHERE id = ?',
      args: [raffle.id],
    });
    const liveRaffle = current.rows[0];
    if (liveRaffle?.status !== 'active') throw new RaffleClosedError();
    if (uniqueNumbers.some(number => number > Number(liveRaffle.total_numbers))) throw new Error('Números inválidos');
    if (!liveRaffle.pix_key || !liveRaffle.pix_receiver_name || !liveRaffle.pix_receiver_city) throw new PixUnavailableError();
    const priceCents = Number(liveRaffle.price_per_number_cents);
    if (expectedPriceCents !== undefined && expectedPriceCents !== priceCents) throw new PriceChangedError(priceCents);
    const nowMillis = Date.now();
    const quota = await transaction.execute({
      sql: `INSERT INTO rate_limit_buckets (key, hits, resets_at) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN resets_at <= ? THEN 1 ELSE hits + 1 END,
              resets_at = CASE WHEN resets_at <= ? THEN ? ELSE resets_at END RETURNING hits, resets_at`,
      args: [`reserve:${slug}:phone:${privateFingerprint(normalizePhone(phone))}`, nowMillis + 86_400_000,
        nowMillis, nowMillis, nowMillis + 86_400_000],
    });
    if (Number(quota.rows[0].hits) > 3) throw new RateLimitError(Math.max(1, Math.ceil((Number(quota.rows[0].resets_at) - nowMillis) / 1000)));
    const totalCents = uniqueNumbers.length * priceCents;
    let pixPayload: string;
    try {
      pixPayload = createPixPayload({
        key: String(liveRaffle.pix_key), receiverName: String(liveRaffle.pix_receiver_name),
        city: String(liveRaffle.pix_receiver_city), amountCents: totalCents, txid,
      });
    } catch { throw new PixUnavailableError(); }
    await transaction.execute({
      sql: `INSERT INTO reservations (id, raffle_id, participant_name, phone, phone_normalized, status, total_cents, pix_txid, pix_payload, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      args: [id, raffle.id, participantName.trim(), formatPhone(phone), normalizePhone(phone), totalCents, txid, pixPayload, reservationDeadline(), now],
    });
    for (const number of uniqueNumbers) {
      const updated = await transaction.execute({
        sql: `UPDATE raffle_numbers SET status = 'reserved', reservation_id = ?, updated_at = ?
              WHERE raffle_id = ? AND number = ? AND status = 'available'`,
        args: [id, now, raffle.id, number],
      });
      if (updated.rowsAffected !== 1) throw new UnavailableNumbersError();
      const row = await transaction.execute({
        sql: 'SELECT id FROM raffle_numbers WHERE raffle_id = ? AND number = ?', args: [raffle.id, number],
      });
      await transaction.execute({
        sql: 'INSERT INTO reservation_numbers (reservation_id, raffle_number_id) VALUES (?, ?)',
        args: [id, String(row.rows[0].id)],
      });
    }
    await transaction.commit();
    return id;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getReservation(slug: string, id: string) {
  const raffle = await getRaffle(slug);
  if (!raffle) return null;
  await expirePendingReservations(raffle.id);
  const [reservation] = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.raffleId, raffle.id)));
  if (!reservation) return null;
  const numberRows = await db.select({ number: raffleNumbers.number }).from(reservationNumbers)
    .innerJoin(raffleNumbers, eq(reservationNumbers.raffleNumberId, raffleNumbers.id))
    .where(eq(reservationNumbers.reservationId, id));
  return { ...reservation, numbers: numberRows.map(row => row.number).sort((a, b) => a - b) };
}

export async function findReservationsByPhone(slug: string, phone: string) {
  const raffle = await getRaffle(slug);
  if (!raffle) return null;
  await expirePendingReservations(raffle.id);
  const people = await db.select({ id: reservations.id, status: reservations.status, createdAt: reservations.createdAt,
    expiresAt: reservations.expiresAt, latePaymentReportedAt: reservations.latePaymentReportedAt,
    latePaymentResolvedAt: reservations.latePaymentResolvedAt })
    .from(reservations).where(and(eq(reservations.raffleId, raffle.id), eq(reservations.phoneNormalized, normalizePhone(phone))));
  if (!people.length) return [];
  const rows = await db.select({ reservationId: reservationNumbers.reservationId, number: raffleNumbers.number })
    .from(reservationNumbers).innerJoin(raffleNumbers, eq(reservationNumbers.raffleNumberId, raffleNumbers.id))
    .where(inArray(reservationNumbers.reservationId, people.map(person => person.id)));
  return people.map(person => ({ status: person.status, createdAt: person.createdAt, expiresAt: person.expiresAt,
    latePaymentReported: Boolean(person.latePaymentReportedAt), latePaymentResolved: Boolean(person.latePaymentResolvedAt),
    numbers: rows.filter(row => row.reservationId === person.id).map(row => row.number).sort((a, b) => a - b),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
