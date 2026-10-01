import { getTheme } from '@/config/themes';
import { requireAdmin } from '@/lib/auth';
import { getAdminStats } from '@/lib/raffle';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { InstallAdminApp } from '@/components/admin/InstallAdminApp';
import { AdminRefresh } from '@/components/admin/AdminRefresh';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await requireAdmin(slug);
  const stats = await getAdminStats(raffle.id, raffle.totalNumbers);
  return <>
    <AdminRefresh/>
    <AdminDashboard slug={slug} title={raffle.title} art={getTheme(raffle.themeKey)!.dashboardArt} stats={stats} status={raffle.status}/>
    <InstallAdminApp slug={slug} babyName={raffle.babyName}/>
  </>;
}
