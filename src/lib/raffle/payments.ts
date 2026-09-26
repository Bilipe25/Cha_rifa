import 'server-only';

import { randomUUID } from 'node:crypto';

import { client } from '@/db';

import { expirePendingReservations } from './lifecycle';

import { getRaffle } from './queries';

import { reservationDeadline } from './shared';

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
