'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatNumber } from '@/lib/currency';
import { participantStatusLabels, type AdminParticipant } from '@/lib/admin-participant';
import { useParticipantSheet } from './ParticipantSheet';

export function ParticipantsManager({ slug, people, drawn }: { slug: string; people: AdminParticipant[]; drawn: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { open, dialogId, sheet } = useParticipantSheet(slug, people, drawn);
  const participantCount = new Set(people.map(person => person.phoneNormalized)).size;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [router]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const digits = query.replace(/\D/g, '');
  const exactNumber = /^\d{1,4}$/.test(query.trim()) && people.some(person => person.numbers.includes(Number(digits))) ? Number(digits) : null;
  const filtered = people.filter(person => exactNumber !== null ? person.numbers.includes(exactNumber)
    : !normalizedQuery || person.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
      || (digits.length >= 2 && person.phoneNormalized.includes(digits)));
  return <div className="participants-panel panel-layout">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="participants-heading"><h2>Participantes <Icon name="heart" size={23}/></h2><span>{participantCount} {participantCount === 1 ? 'participante' : 'participantes'}</span></div>
    {drawn && <p className="inline-notice">Sorteio concluído. Os pagamentos e números estão preservados.</p>}
    <label className="field-label participant-search"><span className="sr-only">Buscar por nome, telefone ou número</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome, telefone ou nº"/></label>
    <p className="participants-hint">Toque na linha para conferir o pagamento e ver o histórico.</p>
    <div className="participants-scroll" tabIndex={0} aria-label="Lista de participantes">
      {!filtered.length && <p className="empty-state">{query ? 'Nenhuma reserva corresponde à busca.' : 'Os participantes aparecerão aqui assim que fizerem uma reserva.'}</p>}
      {filtered.length > 0 && <table className="participants-table"><caption className="sr-only">Participantes, telefones, números escolhidos e situação do pagamento</caption>
        <colgroup><col className="participant-name-column"/><col className="participant-phone-column"/><col className="participant-numbers-column"/><col className="participant-status-column"/></colgroup>
        <thead><tr><th scope="col"><span className="participant-wide-label">Nome</span><span className="participant-mobile-label">Nome / Telefone</span></th><th scope="col" className="participant-phone-cell">Telefone</th><th scope="col">Números <span className="participant-wide-label">escolhidos</span></th><th scope="col">Status</th></tr></thead>
        <tbody>{filtered.map(person => <tr key={person.id} className="participant-row" data-touch-feedback onClick={event => open(person, event.currentTarget)}>
          <th scope="row"><button className="participant-name-button" type="button" aria-haspopup="dialog" aria-controls={dialogId} aria-label={`Ver detalhes da reserva de ${person.name}`}><strong>{person.name}</strong><span className="participant-mobile-phone">{person.phone}</span><span className="participant-expand-label">Detalhes <Icon name="arrow" size={12}/></span></button></th>
          <td className="participant-phone-cell">{person.phone}</td>
          <td><div className="participant-number-chips" aria-label={`Números ${person.numbers.join(', ')}`}>{person.numbers.map(number => <b key={number}>{formatNumber(number)}</b>)}</div></td>
          <td><span className={`participant-payment-status participant-payment-status--${person.status}`}><Icon name={person.status === 'paid' ? 'check' : person.status === 'cancelled' ? 'back' : 'clock'} size={15}/><span>{participantStatusLabels[person.status]}</span></span></td>
        </tr>)}</tbody></table>}
    </div>
    {sheet}
  </div>;
}
