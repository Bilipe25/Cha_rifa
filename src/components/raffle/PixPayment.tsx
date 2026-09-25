'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

export function PixPayment({ slug, reservationId, numbers, totalCents, payload, qr, status }: {
  slug: string; reservationId: string; numbers: number[]; totalCents: number; payload: string; qr: string; status: string;
}) {
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState(status === 'payment_reported' || status === 'paid');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 3500); }
    catch { setError('Não foi possível copiar. Toque e segure o código para selecionar.'); }
  }
  async function report() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/${slug}/payment/${reservationId}`, { method: 'POST' });
      if (!response.ok) throw new Error();
      setReported(true);
    } catch { setError('Não conseguimos registrar agora. Tente novamente.'); }
    finally { setBusy(false); }
  }
  if (status === 'cancelled') return <div className="panel-flow"><div className="panel-heading"><h2>Reserva encerrada</h2><p>Esses números foram liberados. Você pode escolher outros.</p></div><a className="primary-button" href={`/${slug}/numeros`}>ESCOLHER NÚMEROS</a></div>;
  return <div className="pix-payment panel-flow">
    <div className="panel-heading"><h2>{status === 'paid' ? 'Pagamento confirmado' : reported ? 'Pagamento informado' : 'Pix gerado'}</h2><p>{reported ? status === 'paid' ? 'Obrigada por participar!' : 'Prontinho! Agora a mamãe vai confirmar o seu pagamento.' : 'Copie o código abaixo para realizar o pagamento'}</p></div>
    <div className="pix-recap"><span>{numbers.length} {numbers.length === 1 ? 'número' : 'números'} · {numbers.map(formatNumber).join(' · ')}</span><strong>{formatMoney(totalCents)}</strong></div>
    <img className="pix-qr" src={qr} alt="QR Code para pagar esta reserva por Pix" width={160} height={160}/>
    <label className="pix-code-label" htmlFor="pix-code">Pix Copia e Cola</label>
    <textarea id="pix-code" className="pix-code" readOnly value={payload} onFocus={event => event.currentTarget.select()} rows={2}/>
    <button className="secondary-button" type="button" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={19}/>{copied ? 'Pix copiado! 💕' : 'COPIAR PIX'}</button>
    <p className="pix-help">Cole este código no app do seu banco, na opção Pix Copia e Cola.</p>
    {!reported && <button className="primary-button" type="button" onClick={report} disabled={busy}><Icon name="check"/><span>{busy ? 'AGUARDE...' : 'JÁ FIZ O PAGAMENTO'}</span><Icon name="arrow"/></button>}
    {error && <p className="inline-notice" role="alert">{error}</p>}
  </div>;
}
