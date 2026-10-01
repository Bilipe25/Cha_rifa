import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import type { CSSProperties } from 'react';
import { formatMoney, formatNumber } from '@/lib/currency';
import { ShareRaffleButton } from './ShareRaffleButton';
import { LogoutButton } from './LogoutButton';
import { Icon } from '@/components/ui/Icons';
import type { AdminParticipant } from '@/lib/admin-participant';
import { DashboardParticipants } from './DashboardParticipants';

const font = localFont({ src: '../../../public/fonts/dosis-variable.ttf', weight: '200 800', display: 'swap' });
type Participant = { id: string; participantName: string; phone: string; phoneNormalized: string; numbers: number[]; status: string };
type Stats = { reserved: number; totalNumbers: number; confirmed: number; collectedCents: number; awaiting: number; late: number; people: Participant[] };
// Coordinates in the client's 941 × 1672 artwork. All sample data is covered.
const region = (x: number, y: number, width: number, height: number): CSSProperties => ({
  left: `${x / 941 * 100}%`, top: `${y / 1672 * 100}%`, width: `${width / 941 * 100}%`, height: `${height / 1672 * 100}%`,
});
export function AdminDashboard({ slug, title, art, stats, people, status }: { slug: string; title: string; art: string; stats: Stats; people: AdminParticipant[]; status: string }) {
  const active = stats.people.filter(person => person.status !== 'cancelled');
  const participants = new Set(active.map(person => person.phoneNormalized)).size;
  const lastNumber = active[0]?.numbers.at(-1);
  const reserved = `${stats.reserved}/${stats.totalNumbers}`;
  const collected = formatMoney(stats.collectedCents).replace(/^R\$\s*/, '');
  return <div className={`theme-frame dashboard-frame ${font.className}`}><main className="dashboard-scroll">
    <div className="dashboard-stage">
      <Image src={art} fill priority quality={95} alt="" sizes="(max-width: 480px) 100vw, 480px" className="dashboard-reference"/>
      <h1 className="sr-only">Painel da mamãe · {title}</h1>
      <section className="dashboard-live-value dashboard-live-value--reserved" style={{ ...region(54, 541, 259, 73), fontSize: `${Math.min(6.65, 49 / reserved.length)}cqw` }} aria-label="Números reservados"><strong>{reserved}</strong></section>
      <div className="dashboard-live-progress" style={region(54, 619, 258, 17)} role="progressbar" aria-label="Números reservados" aria-valuemin={0} aria-valuemax={stats.totalNumbers} aria-valuenow={stats.reserved}><span style={{ width: `${stats.reserved / stats.totalNumbers * 100}%` }}/></div>
      <section className="dashboard-live-value dashboard-live-value--confirmed" style={region(367, 541, 233, 77)} aria-label="Pagamentos confirmados"><strong>{stats.confirmed}</strong></section>
      <section className="dashboard-live-value dashboard-live-value--collected" style={{ ...region(646, 546, 251, 75), fontSize: `${Math.min(6.25, 57 / (collected.length + 3))}cqw` }} aria-label="Total arrecadado"><strong><small>R$</small> {collected}</strong></section>
      <section className="dashboard-participant-count" style={region(688, 710, 200, 51)} aria-label="Quantidade de participantes">{participants} {participants === 1 ? 'participante' : 'participantes'}</section>
      <section className="dashboard-preview" style={region(45, 790, 855, 375)} tabIndex={0} aria-label="Lista de participantes com rolagem">
        <h2 className="sr-only">Participantes</h2>
        <DashboardParticipants slug={slug} people={people} art={art} drawn={status === 'drawn'}/>
      </section>
      <div className={`dashboard-last-number${String(lastNumber ?? '').length > 2 ? ' dashboard-last-number--long' : ''}`} style={region(269, 1232, 105, 67)} aria-label="Último número reservado">{lastNumber === undefined ? '—' : formatNumber(lastNumber)}</div>
      <Link className="dashboard-art-action" style={region(119, 1332, 706, 128)} href={`/admin/${slug}/sorteio`} aria-label="Realizar sorteio"><span className="sr-only">Realizar sorteio</span></Link>
      <Link className="dashboard-art-action" style={region(136, 1474, 706, 99)} href={`/admin/${slug}/participantes`} aria-label="Ver participantes"><span className="sr-only">Ver participantes</span></Link>
    </div>
    <div className="dashboard-tools">
      <p className="raffle-state">Rifa: {status === 'active' ? 'recebendo reservas' : status === 'closed' ? 'reservas encerradas' : 'sorteio concluído'}</p>
      {stats.awaiting > 0 && <Link className="admin-alert dashboard-payment-alert" href={`/admin/${slug}/participantes`}>{stats.awaiting} {stats.awaiting === 1 ? 'pagamento aguarda' : 'pagamentos aguardam'} sua confirmação.</Link>}
      {stats.late > 0 && <Link className="admin-alert dashboard-payment-alert" href={`/admin/${slug}/participantes`}>{stats.late} {stats.late === 1 ? 'pagamento foi informado' : 'pagamentos foram informados'} após o prazo. Confira os participantes.</Link>}
      <Link className="admin-action" href={`/admin/${slug}/configuracoes`}><span><Icon name="settings" size={20}/> Configurações da rifa</span><Icon name="arrow"/></Link>
      <ShareRaffleButton slug={slug} title={title}/><Link className="back-link" href={`/${slug}`}>Ver página da rifa</Link><LogoutButton slug={slug}/>
    </div>
  </main></div>;
}
