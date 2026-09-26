import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { getTheme } from '@/config/themes';
import { formatDrawDate, formatMoney, formatNumber } from '@/lib/currency';
import { getDraws, getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function ResultPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  const winners = raffle.status === 'drawn' ? await getDraws(raffle.id) : [];
  return <ThemeFrame theme={getTheme(raffle.themeKey)!} variant="guest">
    <div className="result-panel panel-flow">
      <Link className="back-link" href={`/${slug}`}>← Voltar ao início</Link>
      <div className="panel-heading"><h1>Resultado do sorteio</h1><p>{raffle.status === 'drawn' && raffle.drawnAt
        ? `Realizado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Fortaleza' }).format(new Date(raffle.drawnAt))}`
        : `Previsto para ${formatDrawDate(raffle.drawDate)}`}</p></div>
      {winners.length === 2 ? winners.map(winner => <article className="public-winner" key={winner.prizePosition}>
        <span>{winner.prizePosition}º sorteio · {formatMoney(winner.prizeAmountCents ?? (winner.prizePosition === 1 ? raffle.prizeOneCents : raffle.prizeTwoCents))}</span>
        <strong>Número {formatNumber(winner.winningNumber)}</strong>
      </article>) : <p className="empty-state">O resultado aparecerá aqui quando o sorteio for concluído.</p>}
      <div className="result-rules"><h2>Como funciona</h2><p>Cada número com pagamento confirmado vale uma chance. Os dois prêmios vão para números diferentes. A escolha é feita aleatoriamente pelo servidor e o resultado fica registrado.</p></div>
    </div>
  </ThemeFrame>;
}
