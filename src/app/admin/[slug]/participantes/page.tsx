import { getTheme } from '@/config/themes';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { ParticipantsManager } from '@/components/admin/ParticipantsManager';
import { requireAdmin } from '@/lib/auth';
import { getParticipants, getReservationEvents, serializeAdminParticipants } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function ParticipantsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const people = await getParticipants(raffle.id);
  const events = await getReservationEvents(raffle.id);
  const safePeople = serializeAdminParticipants(people, events);
  return <ThemeFrame variant="admin" theme={getTheme(raffle.themeKey)!}><ParticipantsManager slug={slug} people={safePeople} drawn={raffle.status === 'drawn'}/></ThemeFrame>;
}
