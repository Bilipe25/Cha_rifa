import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { AdminParticipant } from '@/lib/admin-participant';

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

export function serializeAdminParticipants(people: Awaited<ReturnType<typeof getParticipants>>, events: Awaited<ReturnType<typeof getReservationEvents>>): AdminParticipant[] {
  const byReservation = new Map<string, AdminParticipant['events']>();
  for (const event of events) {
    const list = byReservation.get(event.reservationId) ?? [];
    list.push({ fromStatus: event.fromStatus, toStatus: event.toStatus, actor: event.actor, note: event.note, createdAt: event.createdAt });
    byReservation.set(event.reservationId, list);
  }
  return people.map(person => {
    const history = byReservation.get(person.id) ?? [];
    // Older reservations have no creation event; their saved creation date is authoritative.
    if (!history.some(event => event.fromStatus === null)) history.push({
      fromStatus: null, toStatus: 'pending', actor: 'participant', note: null, createdAt: person.createdAt,
    });
    return {
      id: person.id, name: person.participantName, phone: person.phone, phoneNormalized: person.phoneNormalized,
      numbers: person.numbers, status: person.status, totalCents: person.totalCents, createdAt: person.createdAt,
      expiresAt: person.expiresAt, latePaymentReportedAt: person.latePaymentReportedAt,
      latePaymentResolvedAt: person.latePaymentResolvedAt,
      events: history.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  });
}

export async function getAdminParticipant(raffleId: string, reservationId: string) {
  await expirePendingReservations(raffleId);
  const [person] = await db.select().from(reservations).where(and(eq(reservations.raffleId, raffleId), eq(reservations.id, reservationId)));
  if (!person) return null;
  const rows = await db.select({ number: raffleNumbers.number }).from(reservationNumbers)
    .innerJoin(raffleNumbers, eq(reservationNumbers.raffleNumberId, raffleNumbers.id))
    .where(eq(reservationNumbers.reservationId, reservationId));
  const events = await db.select().from(reservationEvents)
    .where(and(eq(reservationEvents.raffleId, raffleId), eq(reservationEvents.reservationId, reservationId)));
  return serializeAdminParticipants([{ ...person, numbers: rows.map(row => row.number).sort((a, b) => a - b) }], events)[0];
}
