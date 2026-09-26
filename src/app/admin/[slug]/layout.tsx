import type { Metadata } from 'next';
import { getTheme } from '@/config/themes';
import { getRaffle } from '@/lib/raffle';
import { AdminInstallProvider } from '@/components/pwa/AdminInstallProvider';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  const theme = raffle && getTheme(raffle.themeKey);
  if (!raffle || !theme) return { robots: { index: false, follow: false } };
  return {
    title: `Painel da Mamãe | ${raffle.babyName}`,
    robots: { index: false, follow: false },
    manifest: `/admin/${encodeURIComponent(slug)}/manifest.webmanifest`,
    icons: {
      icon: [{ url: theme.icons.icon192, sizes: '192x192', type: 'image/png' }, { url: theme.icons.icon512, sizes: '512x512', type: 'image/png' }],
      apple: [{ url: theme.icons.appleTouchIcon, sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: `Chá-Rifa ${raffle.babyName}`, statusBarStyle: 'default' },
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminInstallProvider>{children}</AdminInstallProvider>;
}
