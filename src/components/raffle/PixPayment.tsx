'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

export function PixPayment({ slug, reservationId, numbers, totalCents, payload, qr, status, expiresAt, cancelReason, latePaymentReported }: {
  slug: string; reservationId: string; numbers: number[]; totalCents: number; payload: string; qr: string; status: string;
  expiresAt: string | null; cancelReason: string | null; latePaymentReported: boolean;
}) {
  const [current, setCurrent] = useState({ status, expiresAt, cancelReason, latePaymentReported });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/${slug}/payment/${reservationId}`, { cache: 'no-store' });
      if (response.ok) setCurrent(await response.json());
      else if (response.status === 404) setCurrent({ status: 'cancelled', expiresAt: null, cancelReason: 'reset', latePaymentReported: false });
    } catch { /* A próxima atualização tentará novamente. */ }
  }, [slug, reservationId]);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (current.status !== 'pending' || !current.expiresAt) return;
    const delay = Math.max(0, new Date(current.expiresAt).getTime() - Date.now() + 250);
    const timer = window.setTimeout(() => void refresh(), Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [current.status, current.expiresAt, refresh]);
  async function copy() {
    try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 3500); }
    catch { setError('Não foi possível copiar. Toque e segure o código para selecionar.'); }
  }
  async function report() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/${slug}/payment/${reservationId}`, { method: 'POST' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setCurrent(previous => result.late
        ? { ...previous, status: 'cancelled', cancelReason: 'expired', latePaymentReported: true }
        : { ...previous, status: 'payment_reported', expiresAt: null });
      await refresh();
    } catch { setError('Não conseguimos registrar agora. Tente novamente.'); await refresh(); }
    finally { setBusy(false); }
  }
  const navigation = <div className="pix-navigation"><Link className="back-link" href={`/${slug}`}>← Voltar ao início</Link><Link className="back-link" href={`/${slug}/meus-numeros`}>Ver meus números</Link></div>;
  if (current.status === 'cancelled') return <div className="panel-flow cancelled-payment"><div className="panel-heading"><h2>Reserva encerrada</h2><p>Esses números foram liberados e o Pix desta reserva não deve mais ser usado.</p></div>
    <div className="my-number-list">{numbers.map(number => <b key={number}>{formatNumber(number)}</b>)}</div>
    {current.cancelReason === 'expired' && (current.latePaymentReported ? <p className="inline-notice" role="status">Registramos seu aviso de pagamento após o prazo. A organização irá conferir e combinar uma solução com você.</p>
      : <><p className="pix-help">Se você já pagou este Pix, avise a organização para que ela confira o valor e combine uma solução. Os números podem ter sido escolhidos por outra pessoa.</p><button className="secondary-button" type="button" onClick={report} disabled={busy}>{busy ? 'AGUARDE...' : 'JÁ PAGUEI ESSE PIX'}</button></>)}
    {navigation}
    {error && <p className="inline-notice" role="alert">{error}</p>}
  </div>;
  if (current.status === 'paid' || current.status === 'payment_reported') return <div className="pix-payment panel-flow">
    <div className="panel-heading"><h2>{current.status === 'paid' ? 'Pagamento confirmado' : 'Pagamento informado'}</h2><p>{current.status === 'paid' ? 'Obrigada por participar! Seus números estão confirmados.' : 'Recebemos seu aviso. A mamãe irá conferir o pagamento.'}</p></div>
    <div className="pix-recap"><span>Números {numbers.map(formatNumber).join(' · ')}</span><strong>{formatMoney(totalCents)}</strong></div>
    <p className="pix-help">{current.status === 'paid' ? 'Guarde esta página para acompanhar o resultado.' : 'A confirmação é manual. Acompanhe a situação em Meus números.'}</p>
    {navigation}<Link className="secondary-button" href={`/${slug}/resultado`}>ACOMPANHAR RESULTADO</Link>
  </div>;
  return <div className="pix-payment panel-flow">
    <div className="panel-heading"><h2>Pix gerado</h2><p>Copie o código abaixo para realizar o pagamento</p></div>
    <div className="pix-recap"><span>{numbers.length} {numbers.length === 1 ? 'número' : 'números'} · {numbers.map(formatNumber).join(' · ')}</span><strong>{formatMoney(totalCents)}</strong></div>
    {current.expiresAt && <p className="pix-deadline">Esta reserva fica guardada até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(current.expiresAt))}. Depois desse prazo, os números podem ser liberados.</p>}
    {/* O QR Code já é uma imagem gerada em memória para esta reserva. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="pix-qr" src={qr} alt="QR Code para pagar esta reserva por Pix" width={160} height={160}/>
    <label className="pix-code-label" htmlFor="pix-code">Pix Copia e Cola</label>
    <textarea id="pix-code" className="pix-code" readOnly value={payload} onFocus={event => event.currentTarget.select()} rows={2}/>
    <button className="secondary-button" type="button" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={19}/>{copied ? 'Pix copiado! 💕' : 'COPIAR PIX'}</button>
    <p className="pix-help">Cole este código no app do seu banco, na opção Pix Copia e Cola.</p>
    <button className="primary-button" type="button" onClick={report} disabled={busy}><Icon name="check"/><span>{busy ? 'AGUARDE...' : 'JÁ FIZ O PAGAMENTO'}</span><Icon name="arrow"/></button>
    {navigation}
    {error && <p className="inline-notice" role="alert">{error}</p>}
  </div>;
}
