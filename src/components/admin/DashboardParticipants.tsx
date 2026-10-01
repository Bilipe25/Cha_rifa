'use client';

import Image from 'next/image';
import { formatNumber } from '@/lib/currency';
import { participantStatusLabels, type AdminParticipant } from '@/lib/admin-participant';
import { useParticipantSheet } from './ParticipantSheet';

function StatusIcon({ art, paid }: { art: string; paid: boolean }) {
  const y = paid ? 877 : 953;
  return <span className="dashboard-status-art" aria-hidden="true"><Image src={art} width={941} height={1672} quality={95} alt="" sizes="(max-width: 480px) 100vw, 480px"
    style={{ position: 'absolute', maxWidth: 'none', width: `${941 / 36 * 100}%`, height: 'auto', left: `${-752 / 36 * 100}%`, top: `${-y / 36 * 100}%` }}/></span>;
}

export function DashboardParticipants({ slug, people, art, drawn }: { slug: string; people: AdminParticipant[]; art: string; drawn: boolean }) {
  const active = people.filter(person => person.status !== 'cancelled');
  const { open, dialogId, sheet } = useParticipantSheet(slug, people, drawn);
  return <>
    <table className="dashboard-preview-table"><caption className="sr-only">Todas as reservas ativas, da mais recente à mais antiga. Role para ver os demais e toque na linha para abrir os detalhes.</caption>
      <colgroup><col style={{ width: '26%' }}/><col style={{ width: '26%' }}/><col style={{ width: '28%' }}/><col style={{ width: '20%' }}/></colgroup>
      <thead><tr><th scope="col">Nome</th><th scope="col">Telefone</th><th scope="col">Números escolhidos</th><th scope="col">Status</th></tr></thead>
      <tbody>{active.map(person => <tr key={person.id} data-touch-feedback className="dashboard-participant-row" onClick={event => open(person, event.currentTarget)}>
        <th scope="row"><button className="dashboard-participant-button" type="button" aria-haspopup="dialog" aria-controls={dialogId} aria-label={`Ver detalhes da reserva de ${person.name}`}><span className="dashboard-preview-name" title={person.name}>{person.name}</span></button></th>
        <td className="dashboard-preview-phone">{person.phone}</td>
        <td><div className="dashboard-preview-numbers" aria-label={`Números ${person.numbers.join(', ')}`}>
          {person.numbers.slice(0, person.numbers.length > 3 ? 2 : 3).map(number => <b key={number}>{formatNumber(number)}</b>)}
          {person.numbers.length > 3 && <b>+{person.numbers.length - 2}</b>}
        </div></td>
        <td><span className={`dashboard-preview-status dashboard-preview-status--${person.status}`}><StatusIcon art={art} paid={person.status === 'paid'}/><span>{participantStatusLabels[person.status]}</span></span></td>
      </tr>)}{Array.from({ length: Math.max(0, 4 - active.length) }, (_, index) => <tr key={`empty-${index}`} aria-hidden="true" className="dashboard-preview-spacer"><td colSpan={4}/></tr>)}</tbody>
    </table>
    {!active.length && <p className="dashboard-preview-empty">Os participantes aparecerão aqui quando fizerem uma reserva.</p>}
    {sheet}
  </>;
}
