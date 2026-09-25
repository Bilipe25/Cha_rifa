'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

type Winner = { position: number; number: number; name: string; phone: string };

export function DrawManager({ slug, eligibleNumbers, winners, prizeOneCents, prizeTwoCents }: {
  slug: string; eligibleNumbers: number; winners: Winner[]; prizeOneCents: number; prizeTwoCents: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function draw() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/draw`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Não foi possível realizar o sorteio.'); return; }
      setConfirm(false); router.refresh();
    } catch { setError('Não foi possível realizar o sorteio agora.'); }
    finally { setBusy(false); }
  }
  return <div className="draw-panel panel-flow">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="panel-heading"><h2>Sorteio</h2><p>{winners.length ? 'Confira os números sorteados' : `${eligibleNumbers} números com pagamento confirmado`}</p></div>
    <div className="draw-prizes"><div><span>1º sorteio</span><strong>{formatMoney(prizeOneCents)}</strong></div><div><span>2º sorteio</span><strong>{formatMoney(prizeTwoCents)}</strong></div></div>
    {winners.length ? winners.map(winner => <article className="winner-card" key={winner.position}><span>{winner.position}º sorteio</span><strong>Número {formatNumber(winner.number)}</strong><p>{winner.name}</p><p>{winner.phone}</p></article>) : <>
      <p className="draw-explanation">Cada número pago vale uma chance. Os dois prêmios irão para números diferentes.</p>
      <button className="primary-button" onClick={() => setConfirm(true)} disabled={eligibleNumbers < 2}><Icon name="gift"/><span>REALIZAR SORTEIO</span><Icon name="arrow"/></button>
      {eligibleNumbers < 2 && <p className="empty-state">É preciso ter pelo menos dois números pagos para sortear.</p>}
    </>}
    {error && <p className="inline-notice" role="alert">{error}</p>}
    {confirm && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="draw-confirm-title"><h3 id="draw-confirm-title">Confirmar sorteio?</h3><p>Somente os números com pagamento confirmado participarão do sorteio.</p><div><button type="button" className="secondary-button" onClick={() => setConfirm(false)}>Voltar</button><button type="button" className="primary-button" disabled={busy} onClick={draw}>{busy ? 'SORTEANDO...' : 'CONFIRMAR SORTEIO'}</button></div></div></div>}
  </div>;
}
