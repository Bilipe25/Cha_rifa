'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

type Event = { fromStatus: string | null; toStatus: string; actor: string; note: string | null; createdAt: string };
type Person = { id: string; name: string; phone: string; phoneNormalized: string; numbers: number[]; status: string; totalCents: number;
  createdAt: string; expiresAt: string | null; latePaymentReportedAt: string | null; latePaymentResolvedAt: string | null; events: Event[] };
const labels: Record<string, string> = { pending: 'Reservado', payment_reported: 'Aguardando confirmação', paid: 'Pago', cancelled: 'Liberado' };
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value));

export function ParticipantsManager({ slug, people, drawn }: { slug: string; people: Person[]; drawn: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const participantCount = new Set(people.map(person => person.phoneNormalized)).size;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !busy) router.refresh(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [busy, router]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const digits = query.replace(/\D/g, '');
  const exactNumber = /^\d{1,3}$/.test(query.trim()) && people.some(person => person.numbers.includes(Number(digits)))
    ? Number(digits) : null;
  const filtered = people.filter(person => {
    if (exactNumber !== null) return person.numbers.includes(exactNumber);
    const matchesQuery = !normalizedQuery || person.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
      || (digits.length >= 2 && person.phoneNormalized.includes(digits));
    return matchesQuery;
  });
  async function update(person: Person, status: 'paid' | 'pending' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm(person.status === 'paid'
      ? 'Este pagamento está confirmado. Liberar os números pode permitir outra reserva. Confira antes se a pessoa recebeu reembolso ou outra solução. Deseja continuar?'
      : 'Tem certeza que deseja liberar esses números?')) return;
    setBusy(person.id); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/reservation/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível atualizar.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar. Tente novamente.'); }
    finally { setBusy(''); }
  }
  async function resolveLate(person: Person) {
    const note = window.prompt('Descreva a solução combinada com a pessoa (por exemplo, reembolso ou novos números):');
    if (!note) return;
    if (note.trim().length < 8) { setError('Descreva a solução com pelo menos 8 caracteres.'); return; }
    setBusy(person.id); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/late-payment/${person.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível registrar a solução.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a solução. Tente novamente.'); }
    finally { setBusy(''); }
  }
  return <div className="participants-panel panel-layout">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="participants-heading"><h2>Participantes <Icon name="heart" size={23}/></h2><span>{participantCount} {participantCount === 1 ? 'participante' : 'participantes'}</span></div>
    {drawn && <p className="inline-notice">Sorteio concluído. Os pagamentos e números estão preservados.</p>}
    <label className="field-label participant-search"><span className="sr-only">Buscar por nome, telefone ou número</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome, telefone ou nº"/></label>
    <p className="participants-hint">Toque no nome para ver detalhes e conferir o pagamento.</p>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <div className="participants-scroll">
      {!filtered.length && <p className="empty-state">{query ? 'Nenhuma reserva corresponde à busca.' : 'Os participantes aparecerão aqui assim que fizerem uma reserva.'}</p>}
      {filtered.length > 0 && <table className="participants-table"><caption className="sr-only">Participantes, telefones, números escolhidos e situação do pagamento</caption>
        <colgroup><col className="participant-name-column"/><col className="participant-phone-column"/><col className="participant-numbers-column"/><col className="participant-status-column"/></colgroup>
        <thead><tr><th scope="col"><span className="participant-wide-label">Nome</span><span className="participant-mobile-label">Nome / Telefone</span></th><th scope="col" className="participant-phone-cell">Telefone</th><th scope="col">Números <span className="participant-wide-label">escolhidos</span></th><th scope="col">Status</th></tr></thead>
        <tbody>{filtered.map(person => <Fragment key={person.id}><tr className={`participant-row${expanded === person.id ? ' participant-row--expanded' : ''}`}>
          <th scope="row"><button className="participant-name-button" type="button" onClick={() => setExpanded(expanded === person.id ? null : person.id)} aria-expanded={expanded === person.id} aria-controls={`details-${person.id}`} aria-label={`${expanded === person.id ? 'Fechar' : 'Ver'} detalhes da reserva de ${person.name}`}><strong>{person.name}</strong><span className="participant-mobile-phone">{person.phone}</span><span className="participant-expand-label">{expanded === person.id ? 'Fechar' : 'Detalhes'} <Icon name="arrow" size={12}/></span></button></th>
          <td className="participant-phone-cell">{person.phone}</td>
          <td><div className="participant-number-chips" aria-label={`Números ${person.numbers.join(', ')}`}>{person.numbers.map(number => <b key={number}>{formatNumber(number)}</b>)}</div></td>
          <td><span className={`participant-payment-status participant-payment-status--${person.status}`}><Icon name={person.status === 'paid' ? 'check' : person.status === 'cancelled' ? 'back' : 'clock'} size={15}/><span>{person.status === 'pending' ? 'Pendente' : person.status === 'payment_reported' ? 'A conferir' : labels[person.status]}</span></span></td>
        </tr><tr className="participant-details-row" hidden={expanded !== person.id} id={`details-${person.id}`}><td colSpan={4}><div className="participant-details">
        <div className="participant-reservation-meta"><span>Reservou em {dateTime(person.createdAt)}</span><b>{formatMoney(person.totalCents)}</b></div>
        {person.status === 'payment_reported' && <p className="participant-deadline">A pessoa informou que pagou. Confira o Pix antes de confirmar.</p>}
        {person.status === 'pending' && person.expiresAt && <p className="participant-deadline">Prazo até {dateTime(person.expiresAt)}</p>}
        {person.latePaymentReportedAt && <p className="admin-alert">Pagamento informado após o prazo em {dateTime(person.latePaymentReportedAt)}. {person.latePaymentResolvedAt ? 'Solução registrada.' : 'Confira com a pessoa antes de encerrar.'}</p>}
        {!drawn && person.status !== 'cancelled' && <div className="participant-actions">
          {person.status !== 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'paid')}>Confirmar pagamento</button>}
          {person.status === 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'pending')}>Marcar como pendente</button>}
          <button disabled={busy === person.id} onClick={() => update(person, 'cancelled')}>Liberar números</button>
          <a href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        </div>}
        {person.latePaymentReportedAt && !person.latePaymentResolvedAt && <div className="participant-actions"><button disabled={busy === person.id} onClick={() => resolveLate(person)}>Registrar solução</button><a href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Conversar no WhatsApp</a></div>}
        {person.events.length > 0 && <details className="participant-history"><summary>Ver histórico</summary><ol>{person.events.map((event, index) => <li key={`${event.createdAt}-${index}`}><strong>{event.fromStatus === event.toStatus ? 'Registro' : labels[event.toStatus] || event.toStatus}</strong> · {dateTime(event.createdAt)} · {event.actor === 'admin' ? 'Painel da mãe' : event.actor === 'participant' ? 'Participante' : 'Sistema'}{event.note ? ` — ${event.note}` : ''}</li>)}</ol></details>}
      </div></td></tr></Fragment>)}</tbody></table>}
    </div>
  </div>;
}
