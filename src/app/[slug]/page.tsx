import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { Icon } from '@/components/ui/Icons';
import { getTheme } from '@/config/themes';
import { formatDrawDate, formatMoney } from '@/lib/currency';
import { getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  return <ThemeFrame themeKey={raffle.themeKey} kind="home">
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
    <Link href={`/${slug}/numeros`} className="primary-button"><Icon name="ticket" size={24}/><span>ESCOLHER NÚMEROS</span><Icon name="arrow" size={24}/></Link>
  </ThemeFrame>;
}
