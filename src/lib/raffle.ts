import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, client } from '@/db';
import { draws, raffleNumbers, raffles, reservationEvents, reservationNumbers, reservations } from '@/db/schema';
import { createPixPayload } from './pix';
import { formatPhone, normalizePhone } from './phone';
import { MAX_NUMBERS_PER_RESERVATION, RESERVATION_HOURS } from '@/config/limits';

export class UnavailableNumbersError extends Error {}
export class PixUnavailableError extends Error {}
export class RaffleClosedError extends Error {}
export { MAX_NUMBERS_PER_RESERVATION, RESERVATION_HOURS } from '@/config/limits';

function reservationDeadline() { return new Date(Date.now() + RESERVATION_HOURS * 60 * 60 * 1000).toISOString(); }

export function todayInFortaleza() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function expirePendingReservations(raffleId: string) {
  const now = new Date().toISOString();
  const due = await client.execute({
    sql: `SELECT id FROM reservations WHERE raffle_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ? LIMIT 200`,
    args: [raffleId, now],
  });
  if (!due.rows.length) return;
  const transaction = await client.transaction('write');
  try {
    for (const row of due.rows) {
      const reservationId = String(row.id);
      const changed = await transaction.execute({
        sql: `UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'expired'
              WHERE id = ? AND raffle_id = ? AND status = 'pending' AND expires_at <= ?`,
        args: [now, reservationId, raffleId, now],
      });
      if (!changed.rowsAffected) continue;
      await transaction.execute({
        sql: `UPDATE raffle_numbers SET status = 'available', reservation_id = NULL, updated_at = ?
              WHERE reservation_id = ? AND raffle_id = ?`,
        args: [now, reservationId, raffleId],
      });
      await transaction.execute({
        sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, note, created_at)
              VALUES (?, ?, ?, 'pending', 'cancelled', 'system', 'Prazo da reserva encerrado', ?)`,
        args: [randomUUID(), raffleId, reservationId, now],
      });
    }
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function getRaffle(slug: string) {
  const [raffle] = await db.select().from(raffles).where(eq(raffles.slug, slug));
  return raffle;
}

export async function getNumberAvailability(raffleId: string) {
  await expirePendingReservations(raffleId);
  const rows = await db.select({ number: raffleNumbers.number, status: raffleNumbers.status })
    .from(raffleNumbers).where(eq(raffleNumbers.raffleId, raffleId));
  return rows;
}

export async function createReservation(slug: string, numbers: number[], participantName: string, phone: string) {
  const raffle = await getRaffle(slug);
  if (!raffle || raffle.status !== 'active') throw new RaffleClosedError();
  if (!raffle.pixKey || !raffle.pixReceiverName || !raffle.pixReceiverCity) throw new PixUnavailableError();
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);
  if (!uniqueNumbers.length || uniqueNumbers.length > MAX_NUMBERS_PER_RESERVATION || uniqueNumbers.length !== numbers.length || uniqueNumbers.some(n => !Number.isInteger(n) || n < 1 || n > raffle.totalNumbers)) {
    throw new Error('Números inválidos');
  }
  const id = randomUUID();
  const txid = randomUUID().replace(/-/g, '').slice(0, 25).toUpperCase();
  const totalCents = uniqueNumbers.length * raffle.pricePerNumberCents;
  const pixPayload = createPixPayload({
    key: raffle.pixKey, receiverName: raffle.pixReceiverName, city: raffle.pixReceiverCity, amountCents: totalCents, txid,
  });
  const now = new Date().toISOString();
  await expirePendingReservations(raffle.id);
  const transaction = await client.transaction('write');
  try {
    const current = await transaction.execute({ sql: 'SELECT status FROM raffles WHERE id = ?', args: [raffle.id] });
    if (current.rows[0]?.status !== 'active') throw new RaffleClosedError();
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

export async function reportPayment(slug: string, id: string) {
  const raffle = await getRaffle(slug);
  if (!raffle) return 'missing' as const;
  await expirePendingReservations(raffle.id);
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({
      sql: 'SELECT status, cancel_reason, expires_at, late_payment_reported_at FROM reservations WHERE id = ? AND raffle_id = ?', args: [id, raffle.id],
    });
    const row = result.rows[0];
    if (!row || (row.status === 'cancelled' && row.cancel_reason !== 'expired')) {
      await transaction.rollback(); return 'missing' as const;
    }
    const now = new Date().toISOString();
    let currentStatus = String(row.status);
    if (currentStatus === 'pending' && row.expires_at && String(row.expires_at) <= now) {
      await transaction.execute({
        sql: `UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'expired' WHERE id = ?`,
        args: [now, id],
      });
      await transaction.execute({
        sql: `UPDATE raffle_numbers SET status = 'available', reservation_id = NULL, updated_at = ? WHERE reservation_id = ? AND raffle_id = ?`,
        args: [now, id, raffle.id],
      });
      await transaction.execute({
        sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, note, created_at)
              VALUES (?, ?, ?, 'pending', 'cancelled', 'system', 'Prazo da reserva encerrado', ?)`,
        args: [randomUUID(), raffle.id, id, now],
      });
      currentStatus = 'cancelled';
    }
    if (currentStatus === 'cancelled') {
      if (row.late_payment_reported_at) { await transaction.commit(); return 'late' as const; }
      await transaction.execute({ sql: 'UPDATE reservations SET late_payment_reported_at = ? WHERE id = ?', args: [now, id] });
      await transaction.execute({
        sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, note, created_at)
              VALUES (?, ?, ?, 'cancelled', 'cancelled', 'participant', 'Informou pagamento após o prazo; requer conferência', ?)`,
        args: [randomUUID(), raffle.id, id, now],
      });
      await transaction.commit(); return 'late' as const;
    }
    if (currentStatus === 'pending') {
      await transaction.execute({
        sql: `UPDATE reservations SET status = 'payment_reported', payment_reported_at = ?, expires_at = NULL WHERE id = ?`,
        args: [now, id],
      });
      await transaction.execute({
        sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, created_at)
              VALUES (?, ?, ?, 'pending', 'payment_reported', 'participant', ?)`,
        args: [randomUUID(), raffle.id, id, now],
      });
    }
    await transaction.commit(); return 'ok' as const;
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function getParticipants(raffleId: string) {
  await expirePendingReservations(raffleId);
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
    pending: people.filter(person => person.status === 'pending').length,
    late: people.filter(person => person.latePaymentReportedAt && !person.latePaymentResolvedAt).length,
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
    const currentStatus = String(result.rows[0].status);
    const raffle = await transaction.execute({ sql: 'SELECT status FROM raffles WHERE id = ?', args: [raffleId] });
    if (raffle.rows[0]?.status === 'drawn') throw new Error('Sorteio concluído: pagamentos não podem mais ser alterados.');
    if (currentStatus === status) { await transaction.commit(); return; }
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
      sql: `UPDATE reservations SET status = ?, paid_at = ?, cancelled_at = ?, cancel_reason = ?, expires_at = ?,
            payment_reported_at = CASE WHEN ? = 'pending' THEN NULL ELSE payment_reported_at END
            WHERE id = ? AND raffle_id = ?`,
      args: [status, status === 'paid' ? now : null, status === 'cancelled' ? now : null,
        status === 'cancelled' ? 'manual' : null, status === 'pending' ? reservationDeadline() : null,
        status, reservationId, raffleId],
    });
    await transaction.execute({
      sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, created_at)
            VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
      args: [randomUUID(), raffleId, reservationId, currentStatus, status, now],
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

export async function getReservationEvents(raffleId: string) {
  return db.select().from(reservationEvents).where(eq(reservationEvents.raffleId, raffleId));
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

export async function setRaffleClosed(raffleId: string, closed: boolean) {
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({ sql: 'SELECT status FROM raffles WHERE id = ?', args: [raffleId] });
    const status = result.rows[0]?.status;
    if (!status || status === 'drawn') throw new Error('Esta rifa já foi sorteada.');
    if (closed && status === 'active') {
      await transaction.execute({ sql: `UPDATE raffles SET status = 'closed', closed_at = ? WHERE id = ?`, args: [new Date().toISOString(), raffleId] });
    } else if (!closed && status === 'closed') {
      await transaction.execute({ sql: `UPDATE raffles SET status = 'active', closed_at = NULL WHERE id = ?`, args: [raffleId] });
    }
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function resolveLatePayment(raffleId: string, reservationId: string, note: string) {
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({
      sql: `SELECT status, cancel_reason, late_payment_reported_at, late_payment_resolved_at FROM reservations
            WHERE id = ? AND raffle_id = ?`, args: [reservationId, raffleId],
    });
    const row = result.rows[0];
    if (!row || row.status !== 'cancelled' || row.cancel_reason !== 'expired' || !row.late_payment_reported_at || row.late_payment_resolved_at) {
      throw new Error('Pagamento fora do prazo indisponível.');
    }
    const now = new Date().toISOString();
    await transaction.execute({ sql: 'UPDATE reservations SET late_payment_resolved_at = ? WHERE id = ?', args: [now, reservationId] });
    await transaction.execute({
      sql: `INSERT INTO reservation_events (id, raffle_id, reservation_id, from_status, to_status, actor, note, created_at)
            VALUES (?, ?, ?, 'cancelled', 'cancelled', 'admin', ?, ?)`,
      args: [randomUUID(), raffleId, reservationId, note.trim(), now],
    });
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function performDraw(raffleId: string) {
  await expirePendingReservations(raffleId);
  const transaction = await client.transaction('write');
  try {
    const raffle = await transaction.execute({ sql: 'SELECT status, draw_date FROM raffles WHERE id = ?', args: [raffleId] });
    if (raffle.rows[0]?.status !== 'closed') throw new Error('Encerre a rifa antes de realizar o sorteio.');
    if (String(raffle.rows[0].draw_date) > todayInFortaleza()) throw new Error('O sorteio só pode ocorrer na data anunciada ou depois dela.');
    const previous = await transaction.execute({ sql: 'SELECT id FROM draws WHERE raffle_id = ?', args: [raffleId] });
    if (previous.rows.length) throw new Error('Sorteio já realizado');
    const unresolved = await transaction.execute({
      sql: `SELECT COUNT(*) AS total FROM reservations WHERE raffle_id = ? AND status IN ('pending', 'payment_reported')`, args: [raffleId],
    });
    if (Number(unresolved.rows[0].total) > 0) throw new Error('Resolva os pagamentos pendentes antes de sortear.');
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
    await transaction.execute({ sql: `UPDATE raffles SET status = 'drawn', drawn_at = ? WHERE id = ? AND status = 'closed'`, args: [now, raffleId] });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
