import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { ReservationForm } from '@/components/raffle/ReservationForm';
import { getTheme } from '@/config/themes';
import { getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function ReservePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  return <ThemeFrame themeKey={raffle.themeKey} kind="guest">
    <h1 className="sr-only">{raffle.title}</h1>
    <ReservationForm slug={slug} priceCents={raffle.pricePerNumberCents} totalNumbers={raffle.totalNumbers} />
  </ThemeFrame>;
}
