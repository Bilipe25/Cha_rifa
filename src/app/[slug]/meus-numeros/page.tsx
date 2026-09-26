import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { MyNumbersLookup } from '@/components/raffle/MyNumbersLookup';
import { getTheme } from '@/config/themes';
import { getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function MyNumbersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  return <ThemeFrame theme={getTheme(raffle.themeKey)!} variant="guest"><h1 className="sr-only">{raffle.title}</h1><MyNumbersLookup slug={slug}/></ThemeFrame>;
}
