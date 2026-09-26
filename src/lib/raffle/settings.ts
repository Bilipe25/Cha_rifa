import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { client } from '@/db';
import { normalizePixMerchantText } from '@/lib/pix-format';

const pixReceiverField = (maxLength: number) => z.string().trim().min(1).max(maxLength)
  .refine(value => {
    const normalized = normalizePixMerchantText(value);
    return normalized.length > 0 && normalized.length <= maxLength;
  });

export const raffleSettingsSchema = z.object({
  drawDate: z.iso.date().refine(value => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, 'Escolha uma data válida.'),
  prizeOneCents: z.number().int().min(0).max(1_000_000_000),
  prizeTwoCents: z.number().int().min(0).max(1_000_000_000),
  pricePerNumberCents: z.number().int().min(1).max(1_000_000_000),
  totalNumbers: z.number().int().min(1).max(1000),
  pixKey: z.string().trim().min(1).max(77),
  pixReceiverName: pixReceiverField(25),
  pixReceiverCity: pixReceiverField(15),
});

export type RaffleSettingsInput = z.infer<typeof raffleSettingsSchema>;

export class SettingsConflictError extends Error {}

export async function updateRaffleSettings(raffleId: string, input: RaffleSettingsInput) {
  const settings = raffleSettingsSchema.parse(input);
  const transaction = await client.transaction('write');
  try {
    const result = await transaction.execute({
      sql: 'SELECT status, total_numbers FROM raffles WHERE id = ?',
      args: [raffleId],
    });
    const raffle = result.rows[0];
    if (!raffle) throw new SettingsConflictError('Rifa não encontrada.');
    if (raffle.status === 'drawn') throw new SettingsConflictError('As configurações não podem ser alteradas após o sorteio.');
    const oldTotal = Number(raffle.total_numbers);
    const nextTotal = settings.totalNumbers;
    const now = new Date().toISOString();

    if (nextTotal < oldTotal) {
      const inUse = await transaction.execute({
        sql: `SELECT MAX(number) AS highest FROM raffle_numbers
              WHERE raffle_id = ? AND number > ? AND number <= ?
                AND (status NOT IN ('available', 'retired') OR reservation_id IS NOT NULL)`,
        args: [raffleId, nextTotal, oldTotal],
      });
      if (inUse.rows[0]?.highest !== null) {
        throw new SettingsConflictError(`Não é possível diminuir para ${nextTotal} números porque existem reservas acima desse número. Maior número em uso: ${inUse.rows[0].highest}.`);
      }
      // Keep past reservation links intact while hiding numbers outside the current range.
      await transaction.execute({
        sql: `UPDATE raffle_numbers SET status = 'retired', updated_at = ?
              WHERE raffle_id = ? AND number > ? AND number <= ? AND status = 'available' AND reservation_id IS NULL`,
        args: [now, raffleId, nextTotal, oldTotal],
      });
    } else if (nextTotal > oldTotal) {
      const existing = await transaction.execute({
        sql: 'SELECT number, status, reservation_id FROM raffle_numbers WHERE raffle_id = ? AND number > ? AND number <= ?',
        args: [raffleId, oldTotal, nextTotal],
      });
      const byNumber = new Map(existing.rows.map(row => [Number(row.number), row]));
      for (let number = oldTotal + 1; number <= nextTotal; number++) {
        const row = byNumber.get(number);
        if (!row) {
          await transaction.execute({
            sql: `INSERT INTO raffle_numbers (id, raffle_id, number, status, created_at, updated_at)
                  VALUES (?, ?, ?, 'available', ?, ?)`,
            args: [randomUUID(), raffleId, number, now, now],
          });
        } else if (row.status === 'retired' && row.reservation_id === null) {
          await transaction.execute({
            sql: `UPDATE raffle_numbers SET status = 'available', updated_at = ? WHERE raffle_id = ? AND number = ?`,
            args: [now, raffleId, number],
          });
        } else if (row.status !== 'available' || row.reservation_id !== null) {
          throw new SettingsConflictError('Não foi possível atualizar a quantidade de números. Tente novamente.');
        }
      }
    }

    await transaction.execute({
      sql: `UPDATE raffles SET draw_date = ?, prize_one_cents = ?, prize_two_cents = ?,
            price_per_number_cents = ?, total_numbers = ?, pix_key = ?, pix_receiver_name = ?, pix_receiver_city = ?
            WHERE id = ? AND status != 'drawn'`,
      args: [settings.drawDate, settings.prizeOneCents, settings.prizeTwoCents,
        settings.pricePerNumberCents, nextTotal, settings.pixKey, settings.pixReceiverName, settings.pixReceiverCity, raffleId],
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
