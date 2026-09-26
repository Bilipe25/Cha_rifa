import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { Icon } from '@/components/ui/Icons';
import { getTheme } from '@/config/themes';
import { formatDrawDate, formatMoney } from '@/lib/currency';
import { getRaffle } from '@/lib/raffle';
import { MyNumbersEntry } from '@/components/raffle/MyNumbersEntry';
import type { Metadata } from 'next';
import { publicRafflePath } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  const theme = raffle && getTheme(raffle.themeKey);
  if (!raffle || !theme) return {};
  const title = raffle.title.replace(/^Chá Rifa\b/i, 'Chá-Rifa');
  const description = `Participe do ${title} e escolha seus números favoritos 💕`;
  return {
    title: raffle.title,
    description,
    alternates: { canonical: publicRafflePath(slug) },
    openGraph: {
      title: raffle.title, description, type: 'website', url: publicRafflePath(slug),
      images: [{ url: theme.shareImage, width: 1200, height: 630, alt: raffle.title }],
    },
    twitter: { card: 'summary_large_image', title: raffle.title, description, images: [theme.shareImage] },
  };
}

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  return <ThemeFrame theme={getTheme(raffle.themeKey)!} variant="home">
    <h1 className="sr-only">{raffle.title}</h1>
    <p className="home-intro">Participe escolhendo seus números favoritos <span aria-hidden="true">♥</span></p>
    <div className="date-card"><Icon name="calendar" size={30} /><span>Data do sorteio<strong>{formatDrawDate(raffle.drawDate)}</strong></span></div>
    <section className="prize-section" aria-label="Prêmios">
      <h2>Prêmios</h2>
      <div className="prize-grid">
        <div className="prize-card"><Icon name="gift" size={29}/><span>1º sorteio</span><strong>{formatMoney(raffle.prizeOneCents)}</strong></div>
        <div className="prize-card prize-card--purple"><Icon name="gift" size={29}/><span>2º sorteio</span><strong>{formatMoney(raffle.prizeTwoCents)}</strong></div>
      </div>
    </section>
    <div className="price-strip"><Icon name="ticket" size={31}/><span>Do número 1 ao {raffle.totalNumbers}<strong>{formatMoney(raffle.pricePerNumberCents)} <small>cada número</small></strong></span></div>
    {raffle.status === 'active' ? <Link href={`/${slug}/numeros`} className="primary-button"><Icon name="ticket" size={24}/><span>ESCOLHER NÚMEROS</span><Icon name="arrow" size={24}/></Link>
      : raffle.status === 'drawn' ? <Link href={`/${slug}/resultado`} className="primary-button"><Icon name="gift" size={24}/><span>VER RESULTADO</span><Icon name="arrow" size={24}/></Link>
      : <p className="home-closed">Reservas encerradas. O resultado será publicado após o sorteio.</p>}
    <MyNumbersEntry slug={slug}/>
  </ThemeFrame>;
}
