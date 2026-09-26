import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { ParticipantsManager } from '@/components/admin/ParticipantsManager';
import { requireAdmin } from '@/lib/auth';
import { getParticipants, getReservationEvents } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function ParticipantsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const people = await getParticipants(raffle.id);
  const events = await getReservationEvents(raffle.id);
  const safePeople = people.map(person => ({
    id: person.id, name: person.participantName, phone: person.phone, phoneNormalized: person.phoneNormalized,
    numbers: person.numbers, status: person.status, totalCents: person.totalCents, createdAt: person.createdAt,
    expiresAt: person.expiresAt, latePaymentReportedAt: person.latePaymentReportedAt,
    latePaymentResolvedAt: person.latePaymentResolvedAt,
    events: events.filter(event => event.reservationId === person.id).map(event => ({
      fromStatus: event.fromStatus, toStatus: event.toStatus, actor: event.actor, note: event.note, createdAt: event.createdAt,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));
  return <ThemeFrame kind="admin" themeKey={raffle.themeKey}><ParticipantsManager slug={slug} people={safePeople}/></ThemeFrame>;
}
