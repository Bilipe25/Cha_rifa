import { notFound, redirect } from 'next/navigation';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { getTheme } from '@/config/themes';
import { isAdmin } from '@/lib/auth';
import { getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  if (await isAdmin(slug)) redirect(`/admin/${slug}`);
  return <ThemeFrame kind="admin" themeKey={raffle.themeKey}><AdminLogin slug={slug}/></ThemeFrame>;
}
