import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, client } from '@/db';
import { draws, raffleNumbers, raffles, reservationNumbers, reservations } from '@/db/schema';
import { createPixPayload } from './pix';
import { formatPhone, normalizePhone } from './phone';

export class UnavailableNumbersError extends Error {}
export class PixUnavailableError extends Error {}

export async function getRaffle(slug: string) {
  const [raffle] = await db.select().from(raffles).where(eq(raffles.slug, slug));
  return raffle;
}

export async function getNumberAvailability(raffleId: string) {
  const rows = await db.select({ number: raffleNumbers.number, status: raffleNumbers.status })
    .from(raffleNumbers).where(eq(raffleNumbers.raffleId, raffleId));
  return rows;
}

export async function createReservation(slug: string, numbers: number[], participantName: string, phone: string) {
  const raffle = await getRaffle(slug);
  if (!raffle || raffle.status !== 'active') throw new Error('Rifa indisponível');
  if (!raffle.pixKey || !raffle.pixReceiverName || !raffle.pixReceiverCity) throw new PixUnavailableError();
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);
  if (!uniqueNumbers.length || uniqueNumbers.length !== numbers.length || uniqueNumbers.some(n => n < 1 || n > raffle.totalNumbers)) {
    throw new Error('Números inválidos');
  }
  const id = randomUUID();
  const txid = randomUUID().replace(/-/g, '').slice(0, 25).toUpperCase();
  const totalCents = uniqueNumbers.length * raffle.pricePerNumberCents;
  const pixPayload = createPixPayload({
    key: raffle.pixKey, receiverName: raffle.pixReceiverName, city: raffle.pixReceiverCity, amountCents: totalCents, txid,
  });
  const now = new Date().toISOString();
  const transaction = await client.transaction('write');
  try {
    await transaction.execute({
      sql: `INSERT INTO reservations (id, raffle_id, participant_name, phone, phone_normalized, status, total_cents, pix_txid, pix_payload, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      args: [id, raffle.id, participantName.trim(), formatPhone(phone), normalizePhone(phone), totalCents, txid, pixPayload, now],
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
  const [reservation] = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.raffleId, raffle.id)));
  if (!reservation) return null;
  const numberRows = await db.select({ number: raffleNumbers.number }).from(reservationNumbers)
    .innerJoin(raffleNumbers, eq(reservationNumbers.raffleNumberId, raffleNumbers.id))
    .where(eq(reservationNumbers.reservationId, id));
  return { ...reservation, numbers: numberRows.map(row => row.number).sort((a, b) => a - b) };
}

export async function reportPayment(slug: string, id: string) {
  const reservation = await getReservation(slug, id);
  if (!reservation || reservation.status === 'cancelled') return false;
  if (reservation.status === 'pending') {
    await db.update(reservations).set({ status: 'payment_reported', paymentReportedAt: new Date().toISOString() })
      .where(and(eq(reservations.id, id), eq(reservations.status, 'pending')));
  }
  return true;
}

export async function getParticipants(raffleId: string) {
  const people = await db.select().from(reservations).where(eq(reservations.raffleId, raffleId));
  if (!people.length) return [];
  const rows = await db.select({ reservationId: reservationNumbers.reservationId, number: raffleNumbers.number })
    .from(reservationNumbers).innerJoin(raffleNumbers, eq(reservationNumbers.raffleNumberId, raffleNumbers.id))
    .where(inArray(reservationNumbers.reservationId, people.map(person => person.id)));
  const byReservation = new Map<string, number[]>();
  for (const row of rows) byReservation.set(row.reservationId, [...(byReservation.get(row.reservationId) ?? []), row.number]);
  return people.map(person => ({ ...person, numbers: (byReservation.get(person.id) ?? []).sort((a, b) => a - b) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAdminStats(raffleId: string, totalNumbers: number) {
  const people = await getParticipants(raffleId);
  const active = people.filter(person => person.status !== 'cancelled');
  const paid = people.filter(person => person.status === 'paid');
  return {
    reserved: active.reduce((total, person) => total + person.numbers.length, 0),
    totalNumbers,
    confirmed: paid.length,
    collectedCents: paid.reduce((total, person) => total + person.totalCents, 0),
    awaiting: people.filter(person => person.status === 'payment_reported').length,
    people,
  };
}

export async function setReservationStatus(raffleId: string, reservationId: string, status: 'paid' | 'pending' | 'cancelled') {
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({
      sql: 'SELECT status FROM reservations WHERE id = ? AND raffle_id = ?', args: [reservationId, raffleId],
    });
    if (!result.rows.length || result.rows[0].status === 'cancelled') throw new Error('Reserva indisponível');
    const drawn = await transaction.execute({
      sql: 'SELECT id FROM draws WHERE reservation_id = ? AND raffle_id = ? LIMIT 1', args: [reservationId, raffleId],
    });
    if (drawn.rows.length && status !== 'paid') throw new Error('O pagamento de uma pessoa sorteada não pode ser alterado.');
    const now = new Date().toISOString();
    if (status === 'cancelled') {
      await transaction.execute({
        sql: `UPDATE raffle_numbers SET status = 'available', reservation_id = NULL, updated_at = ? WHERE reservation_id = ? AND raffle_id = ?`,
        args: [now, reservationId, raffleId],
      });
    }
    await transaction.execute({
      sql: `UPDATE reservations SET status = ?, paid_at = ?, cancelled_at = ? WHERE id = ? AND raffle_id = ?`,
      args: [status, status === 'paid' ? now : null, status === 'cancelled' ? now : null, reservationId, raffleId],
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getDraws(raffleId: string) {
  const rows = await db.select().from(draws).where(eq(draws.raffleId, raffleId));
  return rows.sort((a, b) => a.prizePosition - b.prizePosition);
}

export async function performDraw(raffleId: string) {
  const transaction = await client.transaction('write');
  try {
    const previous = await transaction.execute({ sql: 'SELECT id FROM draws WHERE raffle_id = ?', args: [raffleId] });
    if (previous.rows.length) throw new Error('Sorteio já realizado');
    const eligible = await transaction.execute({
      sql: `SELECT rn.number AS number, rn.reservation_id AS reservation_id
            FROM raffle_numbers rn JOIN reservations r ON r.id = rn.reservation_id
            WHERE rn.raffle_id = ? AND r.status = 'paid' ORDER BY rn.number`,
      args: [raffleId],
    });
    if (eligible.rows.length < 2) throw new Error('É preciso ter pelo menos dois números pagos para realizar o sorteio.');
    const pool = [...eligible.rows];
    const first = pool.splice(randomInt(pool.length), 1)[0];
    const second = pool.splice(randomInt(pool.length), 1)[0];
    const now = new Date().toISOString();
    for (const [index, winner] of [first, second].entries()) {
      await transaction.execute({
        sql: 'INSERT INTO draws (id, raffle_id, prize_position, prize_label, winning_number, reservation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [randomUUID(), raffleId, index + 1, `${index + 1}º sorteio`, Number(winner.number), String(winner.reservation_id), now],
      });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
