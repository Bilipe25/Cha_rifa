'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

type Event = { fromStatus: string | null; toStatus: string; actor: string; note: string | null; createdAt: string };
type Person = { id: string; name: string; phone: string; phoneNormalized: string; numbers: number[]; status: string; totalCents: number;
  createdAt: string; expiresAt: string | null; latePaymentReportedAt: string | null; latePaymentResolvedAt: string | null; events: Event[] };
const labels: Record<string, string> = { pending: 'Reservado', payment_reported: 'Aguardando confirmação', paid: 'Pago', cancelled: 'Liberado' };
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value));

export function ParticipantsManager({ slug, people }: { slug: string; people: Person[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'pending' | 'reported' | 'paid' | 'late'>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const digits = query.replace(/\D/g, '');
  const filtered = people.filter(person => {
    const matchesStatus = filter === 'all' || (filter === 'late'
      ? Boolean(person.latePaymentReportedAt && !person.latePaymentResolvedAt)
      : person.status === (filter === 'reported' ? 'payment_reported' : filter));
    const matchesQuery = !normalizedQuery || person.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
      || (digits.length >= 2 && (person.phoneNormalized.includes(digits) || person.numbers.some(number => String(number).padStart(2, '0').includes(digits))));
    return matchesStatus && matchesQuery;
  });
  async function update(person: Person, status: 'paid' | 'pending' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm(person.status === 'paid'
      ? 'Este pagamento está confirmado. Liberar os números pode permitir outra reserva. Confira antes se a pessoa recebeu reembolso ou outra solução. Deseja continuar?'
      : 'Tem certeza que deseja liberar esses números?')) return;
    setBusy(person.id); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/reservation/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch { setError('Não foi possível atualizar. Tente novamente.'); }
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
      if (!response.ok) throw new Error();
      router.refresh();
    } catch { setError('Não foi possível registrar a solução. Tente novamente.'); }
    finally { setBusy(''); }
  }
  return <div className="participants-panel panel-layout">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="panel-heading"><h2>Participantes</h2><p>{people.length} {people.length === 1 ? 'pessoa participou' : 'pessoas participaram'}</p></div>
    <label className="field-label participant-search">Buscar por nome, telefone ou número<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: Maria, 79 ou 18"/></label>
    <div className="filter-row" role="group" aria-label="Filtrar participantes">
      {([['all','Todos'],['pending','Sem pagamento'],['reported','Avisaram que pagaram'],['paid','Pagos'],['late','Após o prazo']] as const).map(([value, label]) =>
        <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <div className="participants-scroll">
      {!filtered.length && <p className="empty-state">Nenhuma reserva corresponde à busca ou ao filtro.</p>}
      {filtered.map(person => <article className="participant-card" key={person.id}>
        <div className="participant-header"><strong>{person.name}</strong><span className={`status-badge status-badge--${person.status}`}>{labels[person.status]}</span></div>
        <p>{person.phone} · Reservou em {dateTime(person.createdAt)}</p><div className="participant-detail"><span>Números {person.numbers.map(formatNumber).join(', ')}</span><b>{formatMoney(person.totalCents)}</b></div>
        {person.status === 'pending' && person.expiresAt && <p className="participant-deadline">Prazo até {dateTime(person.expiresAt)}</p>}
        {person.latePaymentReportedAt && <p className="admin-alert">Pagamento informado após o prazo em {dateTime(person.latePaymentReportedAt)}. {person.latePaymentResolvedAt ? 'Solução registrada.' : 'Confira com a pessoa antes de encerrar.'}</p>}
        {person.status !== 'cancelled' && <div className="participant-actions">
          {person.status !== 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'paid')}>Confirmar pagamento</button>}
          {person.status === 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'pending')}>Marcar como pendente</button>}
          <button disabled={busy === person.id} onClick={() => update(person, 'cancelled')}>Liberar números</button>
          <a href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        </div>}
        {person.latePaymentReportedAt && !person.latePaymentResolvedAt && <div className="participant-actions"><button disabled={busy === person.id} onClick={() => resolveLate(person)}>Registrar solução</button><a href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Conversar no WhatsApp</a></div>}
        {person.events.length > 0 && <details className="participant-history"><summary>Ver histórico</summary><ol>{person.events.map((event, index) => <li key={`${event.createdAt}-${index}`}><strong>{event.fromStatus === event.toStatus ? 'Registro' : labels[event.toStatus] || event.toStatus}</strong> · {dateTime(event.createdAt)} · {event.actor === 'admin' ? 'Painel da mãe' : event.actor === 'participant' ? 'Participante' : 'Sistema'}{event.note ? ` — ${event.note}` : ''}</li>)}</ol></details>}
      </article>)}
    </div>
  </div>;
}
