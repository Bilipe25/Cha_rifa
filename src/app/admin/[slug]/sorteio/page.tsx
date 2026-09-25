import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { DrawManager } from '@/components/admin/DrawManager';
import { requireAdmin } from '@/lib/auth';
import { getDraws, getParticipants } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function DrawPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const [draws, people] = await Promise.all([getDraws(raffle.id), getParticipants(raffle.id)]);
  const eligibleNumbers = people.filter(person => person.status === 'paid').reduce((total, person) => total + person.numbers.length, 0);
  const winners = draws.map(draw => {
    const person = people.find(item => item.id === draw.reservationId);
    return { position: draw.prizePosition, number: draw.winningNumber, name: person?.participantName ?? '', phone: person?.phone ?? '' };
  });
  return <ThemeFrame kind="admin" themeKey={raffle.themeKey}><DrawManager slug={slug} eligibleNumbers={eligibleNumbers} winners={winners} prizeOneCents={raffle.prizeOneCents} prizeTwoCents={raffle.prizeTwoCents}/></ThemeFrame>;
}
