import 'server-only';

import { randomInt, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { client, db } from '@/db';

import { draws } from '@/db/schema';

import { expirePendingReservations } from './lifecycle';

import { todayInFortaleza } from './shared';

export async function getDraws(raffleId: string) {
  const rows = await db.select().from(draws).where(eq(draws.raffleId, raffleId));
  return rows.sort((a, b) => a.prizePosition - b.prizePosition);
}

export async function performDraw(raffleId: string) {
  await expirePendingReservations(raffleId);
  const transaction = await client.transaction('write');
  try {
    const raffle = await transaction.execute({ sql: 'SELECT status, draw_date, prize_one_cents, prize_two_cents FROM raffles WHERE id = ?', args: [raffleId] });
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
        sql: 'INSERT INTO draws (id, raffle_id, prize_position, prize_label, prize_amount_cents, winning_number, reservation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [randomUUID(), raffleId, index + 1, `${index + 1}º sorteio`, Number(raffle.rows[0][index === 0 ? 'prize_one_cents' : 'prize_two_cents']), Number(winner.number), String(winner.reservation_id), now],
      });
    }
    await transaction.execute({ sql: `UPDATE raffles SET status = 'drawn', drawn_at = ? WHERE id = ? AND status = 'closed'`, args: [now, raffleId] });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
