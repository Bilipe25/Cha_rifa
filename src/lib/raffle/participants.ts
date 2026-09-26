import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';

import { raffleNumbers, reservationEvents, reservationNumbers, reservations } from '@/db/schema';

import { expirePendingReservations } from './lifecycle';

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

export async function getReservationEvents(raffleId: string) {
  return db.select().from(reservationEvents).where(eq(reservationEvents.raffleId, raffleId));
}
