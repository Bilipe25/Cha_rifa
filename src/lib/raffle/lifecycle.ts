import 'server-only';

import { randomUUID } from 'node:crypto';

import { client } from '@/db';
import { RESERVATION_HOURS } from '@/config/limits';

export async function expirePendingReservations(raffleId: string) {
  const now = new Date().toISOString();
  const legacyDeadline = new Date(Date.now() - RESERVATION_HOURS * 60 * 60 * 1000).toISOString();
  const due = await client.execute({
    sql: `SELECT id FROM reservations WHERE raffle_id = ? AND status = 'pending' AND
          (expires_at <= ? OR (expires_at IS NULL AND created_at <= ?)) LIMIT 200`,
    args: [raffleId, now, legacyDeadline],
  });
  if (!due.rows.length) return;
  const transaction = await client.transaction('write');
  try {
    for (const row of due.rows) {
      const reservationId = String(row.id);
      const changed = await transaction.execute({
        sql: `UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'expired'
              WHERE id = ? AND raffle_id = ? AND status = 'pending' AND
                (expires_at <= ? OR (expires_at IS NULL AND created_at <= ?))`,
        args: [now, reservationId, raffleId, now, legacyDeadline],
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
