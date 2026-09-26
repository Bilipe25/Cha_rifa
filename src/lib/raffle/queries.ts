import 'server-only';

import { and, eq, lte } from 'drizzle-orm';

import { db } from '@/db';

import { raffleNumbers, raffles } from '@/db/schema';

import { expirePendingReservations } from './lifecycle';

export async function getRaffle(slug: string) {
  const [raffle] = await db.select().from(raffles).where(eq(raffles.slug, slug));
  return raffle;
}

export async function getNumberAvailability(raffleId: string) {
  await expirePendingReservations(raffleId);
  const [raffle] = await db.select({ totalNumbers: raffles.totalNumbers }).from(raffles).where(eq(raffles.id, raffleId));
  if (!raffle) return [];
  const rows = await db.select({ number: raffleNumbers.number, status: raffleNumbers.status })
    .from(raffleNumbers).where(and(eq(raffleNumbers.raffleId, raffleId), lte(raffleNumbers.number, raffle.totalNumbers)));
  return rows;
}
