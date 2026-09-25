'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

type Person = { id: string; name: string; phone: string; phoneNormalized: string; numbers: number[]; status: string; totalCents: number };
const labels: Record<string, string> = { pending: 'Reservado', payment_reported: 'Aguardando confirmação', paid: 'Pago', cancelled: 'Liberado' };

export function ParticipantsManager({ slug, people }: { slug: string; people: Person[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'waiting' | 'paid'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const filtered = people.filter(person => filter === 'all' || (filter === 'waiting' ? person.status === 'payment_reported' || person.status === 'pending' : person.status === 'paid'));
  async function update(person: Person, status: 'paid' | 'pending' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm('Tem certeza que deseja liberar esses números?')) return;
    setBusy(person.id); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/reservation/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch { setError('Não foi possível atualizar. Tente novamente.'); }
    finally { setBusy(''); }
  }
  return <div className="participants-panel panel-layout">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="panel-heading"><h2>Participantes</h2><p>{people.length} {people.length === 1 ? 'pessoa participou' : 'pessoas participaram'}</p></div>
    <div className="filter-row" aria-label="Filtrar participantes"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button className={filter === 'waiting' ? 'active' : ''} onClick={() => setFilter('waiting')}>Pendentes</button><button className={filter === 'paid' ? 'active' : ''} onClick={() => setFilter('paid')}>Pagos</button></div>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <div className="participants-scroll">
      {!filtered.length && <p className="empty-state">Nenhum participante nesta lista ainda.</p>}
      {filtered.map(person => <article className="participant-card" key={person.id}>
        <div className="participant-header"><strong>{person.name}</strong><span className={`status-badge status-badge--${person.status}`}>{labels[person.status]}</span></div>
        <p>{person.phone}</p><div className="participant-detail"><span>Números {person.numbers.map(formatNumber).join(', ')}</span><b>{formatMoney(person.totalCents)}</b></div>
        {person.status !== 'cancelled' && <div className="participant-actions">
          {person.status !== 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'paid')}>Confirmar pagamento</button>}
          {person.status === 'paid' && <button disabled={busy === person.id} onClick={() => update(person, 'pending')}>Marcar como pendente</button>}
          <button disabled={busy === person.id} onClick={() => update(person, 'cancelled')}>Liberar números</button>
          <a href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        </div>}
      </article>)}
    </div>
  </div>;
}
