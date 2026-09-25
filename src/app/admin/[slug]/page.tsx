import Link from 'next/link';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { Icon } from '@/components/ui/Icons';
import { LogoutButton } from '@/components/admin/LogoutButton';
import { formatMoney } from '@/lib/currency';
import { requireAdmin } from '@/lib/auth';
import { getAdminStats } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const stats = await getAdminStats(raffle.id, raffle.totalNumbers);
  return <ThemeFrame kind="admin" themeKey={raffle.themeKey}>
    <div className="admin-panel panel-flow">
      <div className="admin-topline"><span>Resumo da rifa</span><Link href={`/${slug}`}>Ver página da rifa</Link></div>
      <div className="stat-card stat-card--featured"><span>Números reservados</span><strong>{stats.reserved}<small>/{stats.totalNumbers}</small></strong><div className="progress-track"><i style={{ width: `${stats.reserved / stats.totalNumbers * 100}%` }}/></div></div>
      <div className="stat-row"><div className="stat-card"><span>Pagamentos confirmados</span><strong>{stats.confirmed}</strong></div><div className="stat-card"><span>Total arrecadado</span><strong>{formatMoney(stats.collectedCents)}</strong></div></div>
      {stats.awaiting > 0 && <p className="admin-alert">{stats.awaiting} {stats.awaiting === 1 ? 'pagamento aguarda' : 'pagamentos aguardam'} sua confirmação.</p>}
      <div className="admin-actions"><Link className="admin-action" href={`/admin/${slug}/participantes`}><span>Ver participantes</span><Icon name="arrow"/></Link><Link className="admin-action" href={`/admin/${slug}/sorteio`}><span>Realizar sorteio</span><Icon name="arrow"/></Link></div>
      <LogoutButton slug={slug}/>
    </div>
  </ThemeFrame>;
}
