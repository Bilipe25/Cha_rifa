import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { NumberPicker } from '@/components/raffle/NumberPicker';
import { getTheme } from '@/config/themes';
import { getNumberAvailability, getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function NumbersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  const availability = await getNumberAvailability(raffle.id);
  return <ThemeFrame themeKey={raffle.themeKey} kind="guest">
    <h1 className="sr-only">{raffle.title}</h1>
    <NumberPicker slug={slug} totalNumbers={raffle.totalNumbers} priceCents={raffle.pricePerNumberCents}
      initialOccupied={availability.filter(item => item.status !== 'available').map(item => item.number)} />
  </ThemeFrame>;
}
