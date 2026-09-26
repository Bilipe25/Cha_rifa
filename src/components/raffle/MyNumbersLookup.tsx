'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { formatNumber } from '@/lib/currency';
import { validPhone } from '@/lib/phone';

type FoundReservation = { status: string; createdAt: string; expiresAt: string | null; latePaymentReported: boolean; latePaymentResolved: boolean; numbers: number[] };
const labels: Record<string, string> = {
  pending: 'Aguardando pagamento', payment_reported: 'Pagamento informado à mamãe',
  paid: 'Pagamento confirmado', cancelled: 'Números liberados',
};

export function MyNumbersLookup({ slug }: { slug: string }) {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<FoundReservation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validPhone(phone)) { setError('Confira o número do WhatsApp.'); return; }
    setBusy(true); setError(''); setResults(null);
    try {
      const response = await fetch(`/api/${slug}/my-numbers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Não conseguimos consultar agora.'); return; }
      setResults(data.reservations);
    } catch { setError('Não conseguimos consultar agora. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <div className="panel-flow my-numbers-panel">
    <Link className="back-link" href={`/${slug}`}>← Voltar ao início</Link>
    <div className="panel-heading"><h2>Meus números</h2><p>Informe o WhatsApp usado na reserva.</p></div>
    <form onSubmit={submit}>
      <label className="field-label">Telefone / WhatsApp
        <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="(79) 99999-9999" required/>
      </label>
      <button className="primary-button" type="submit" disabled={busy}><span>{busy ? 'CONSULTANDO...' : 'VER MEUS NÚMEROS'}</span></button>
    </form>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    {results?.length === 0 && <p className="empty-state" role="status">Não encontramos uma reserva com esse telefone. Confira o número digitado.</p>}
    {results && results.length > 0 && <section className="my-reservations" aria-label="Suas reservas">
      <p className="my-reservations-intro">Encontramos {results.length} {results.length === 1 ? 'reserva' : 'reservas'} para esse telefone.</p>
      {results.map((item, index) => <article className="my-reservation-card" key={`${item.createdAt}-${index}`}>
        <div className="my-reservation-top"><strong>Reserva de {new Intl.DateTimeFormat('pt-BR').format(new Date(item.createdAt))}</strong><span>{labels[item.status] || 'Em análise'}</span></div>
        <div className="my-number-list">{item.numbers.map(number => <b key={number}>{formatNumber(number)}</b>)}</div>
        {item.status === 'pending' && item.expiresAt && <p>Faça o Pix até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(item.expiresAt))} para manter esses números.</p>}
        {item.latePaymentReported && <p>{item.latePaymentResolved ? 'A organização registrou a solução para o pagamento fora do prazo.' : 'Você informou um pagamento após o prazo. A organização precisa conferir o caso.'}</p>}
      </article>)}
      <p className="lookup-privacy">Esta consulta mostra apenas números e situação das reservas. Guarde o link do Pix recebido ao reservar para voltar ao pagamento.</p>
    </section>}
  </div>;
}
