import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { RaffleSettingsForm } from '@/components/admin/RaffleSettingsForm';
import { getTheme } from '@/config/themes';
import { requireAdmin } from '@/lib/auth';
import { getParticipants } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const theme = getTheme(raffle.themeKey);
  if (!theme) return null;
  const reservations = await getParticipants(raffle.id);
  return <ThemeFrame theme={theme} variant="admin">
    <RaffleSettingsForm
      slug={slug}
      hasReservations={reservations.length > 0}
      drawn={raffle.status === 'drawn'}
      initial={{
        drawDate: raffle.drawDate,
        prizeOneCents: raffle.prizeOneCents,
        prizeTwoCents: raffle.prizeTwoCents,
        pricePerNumberCents: raffle.pricePerNumberCents,
        totalNumbers: raffle.totalNumbers,
      }}
    />
  </ThemeFrame>;
}
