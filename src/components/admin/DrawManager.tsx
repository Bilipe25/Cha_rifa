'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

type Winner = { position: number; number: number; name: string; phone: string };

export function DrawManager({ slug, eligibleNumbers, winners, prizeOneCents, prizeTwoCents, raffleStatus, unresolved, drawDateReached }: {
  slug: string; eligibleNumbers: number; winners: Winner[]; prizeOneCents: number; prizeTwoCents: number;
  raffleStatus: string; unresolved: number; drawDateReached: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirm) return;
    const dialog = dialogRef.current;
    const openButton = openButtonRef.current;
    const first = dialog?.querySelector<HTMLButtonElement>('button');
    first?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setConfirm(false); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      const firstButton = buttons[0], lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === firstButton) { event.preventDefault(); lastButton.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); firstButton.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); openButton?.focus(); };
  }, [confirm]);
  async function changeLifecycle(action: 'close' | 'reopen') {
    const prompt = action === 'close'
      ? 'Encerrar novas reservas? Confira os pagamentos pendentes antes de sortear. Você poderá reabrir a rifa antes do sorteio.'
      : 'Reabrir a rifa para novas reservas?';
    if (!window.confirm(prompt)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      if (!response.ok) { setError(result.error || 'Não foi possível atualizar a rifa.'); return; }
      router.refresh();
    } catch { setError('Não foi possível atualizar a rifa agora.'); }
    finally { setBusy(false); }
  }
  async function draw() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/draw`, { method: 'POST' });
      const result = await response.json();
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      if (!response.ok) { setError(result.error || 'Não foi possível realizar o sorteio.'); return; }
      setConfirm(false); router.refresh();
    } catch { setError('Não foi possível realizar o sorteio agora.'); }
    finally { setBusy(false); }
  }
  return <div className="draw-panel panel-flow">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="panel-heading"><h2>Sorteio</h2><p>{winners.length ? 'Confira os números sorteados' : `${eligibleNumbers} números com pagamento confirmado`}</p></div>
    <div className="draw-prizes"><div><span>1º sorteio</span><strong>{formatMoney(prizeOneCents)}</strong></div><div><span>2º sorteio</span><strong>{formatMoney(prizeTwoCents)}</strong></div></div>
    {!winners.length && <div className="draw-readiness">
      <strong>{raffleStatus === 'active' ? 'Rifa aberta' : 'Reservas encerradas'}</strong>
      <p>{raffleStatus === 'active' ? 'Encerre as reservas antes de realizar o sorteio.' : unresolved ? `Resolva ${unresolved} ${unresolved === 1 ? 'reserva pendente' : 'reservas pendentes'} no painel de participantes.` : !drawDateReached ? 'O sorteio só pode acontecer na data anunciada ou depois dela.' : 'Tudo pronto para o sorteio, se houver dois números pagos.'}</p>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => changeLifecycle(raffleStatus === 'active' ? 'close' : 'reopen')}>{raffleStatus === 'active' ? 'ENCERRAR RESERVAS' : 'REABRIR RESERVAS'}</button>
    </div>}
    {winners.length ? winners.map(winner => <article className="winner-card" key={winner.position}><span>{winner.position}º sorteio</span><strong>Número {formatNumber(winner.number)}</strong><p>{winner.name}</p><p>{winner.phone}</p></article>) : <>
      <p className="draw-explanation">Cada número pago vale uma chance. Os dois prêmios irão para números diferentes.</p>
      <button ref={openButtonRef} className="primary-button" onClick={() => setConfirm(true)} disabled={eligibleNumbers < 2 || raffleStatus !== 'closed' || unresolved > 0 || !drawDateReached}><Icon name="gift"/><span>REALIZAR SORTEIO</span><Icon name="arrow"/></button>
      {eligibleNumbers < 2 && <p className="empty-state">É preciso ter pelo menos dois números pagos para sortear.</p>}
    </>}
    {!confirm && error && <p className="inline-notice" role="alert">{error}</p>}
    {confirm && <div className="modal-backdrop" role="presentation"><div ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="draw-confirm-title"><h3 id="draw-confirm-title">Confirmar sorteio?</h3><p>Somente os números com pagamento confirmado participarão do sorteio. Esta ação não poderá ser desfeita.</p>{error && <p className="inline-notice" role="alert">{error}</p>}<div><button type="button" className="secondary-button" onClick={() => setConfirm(false)}>Voltar</button><button type="button" className="primary-button" disabled={busy} onClick={draw}>{busy ? 'SORTEANDO...' : 'CONFIRMAR SORTEIO'}</button></div></div></div>}
  </div>;
}
