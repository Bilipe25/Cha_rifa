import { NextResponse } from 'next/server';
import { getTheme } from '@/config/themes';
import { getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  const theme = raffle && getTheme(raffle.themeKey);
  if (!raffle || !theme) return new Response(null, { status: 404 });
  const adminPath = `/admin/${encodeURIComponent(slug)}`;
  return NextResponse.json({
    id: adminPath,
    name: `Painel - ${raffle.title}`,
    short_name: 'Chá-Rifa',
    start_url: adminPath,
    scope: adminPath,
    display: 'standalone',
    background_color: theme.backgroundColor,
    theme_color: theme.themeColor,
    icons: [
      { src: theme.icons.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: theme.icons.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' } });
}
