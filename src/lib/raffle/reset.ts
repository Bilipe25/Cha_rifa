import 'server-only';
import { client } from '@/db';

/** Clears one raffle's round, preserving its configuration and number records. */
export async function resetRaffle(raffleId: string) {
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({
      sql: 'SELECT slug, total_numbers FROM raffles WHERE id = ?', args: [raffleId],
    });
    const raffle = result.rows[0];
    if (!raffle) throw new Error('Rifa não encontrada.');
    await transaction.execute({ sql: 'DELETE FROM draws WHERE raffle_id = ?', args: [raffleId] });
    await transaction.execute({ sql: 'DELETE FROM reservation_events WHERE raffle_id = ?', args: [raffleId] });
    await transaction.execute({
      sql: 'DELETE FROM reservation_numbers WHERE reservation_id IN (SELECT id FROM reservations WHERE raffle_id = ?)',
      args: [raffleId],
    });
    await transaction.execute({
      sql: `UPDATE raffle_numbers SET reservation_id = NULL,
            status = CASE WHEN number <= ? THEN 'available' ELSE 'retired' END, updated_at = ? WHERE raffle_id = ?`,
      args: [Number(raffle.total_numbers), new Date().toISOString(), raffleId],
    });
    await transaction.execute({ sql: 'DELETE FROM reservations WHERE raffle_id = ?', args: [raffleId] });
    const prefix = `reserve:${raffle.slug}:`;
    await transaction.execute({
      sql: 'DELETE FROM rate_limit_buckets WHERE substr(key, 1, ?) = ?', args: [prefix.length, prefix],
    });
    await transaction.execute({
      sql: "UPDATE raffles SET status = 'active', closed_at = NULL, drawn_at = NULL WHERE id = ?", args: [raffleId],
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
