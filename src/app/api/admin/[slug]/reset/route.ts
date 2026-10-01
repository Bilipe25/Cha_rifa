import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getRaffle, resetRaffle } from '@/lib/raffle';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!await isAdmin(slug)) return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== request.headers.get('host')) {
        return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
      }
    } catch { return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 }); }
  }
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== 'RESETAR') {
    return NextResponse.json({ error: 'Digite RESETAR para confirmar.' }, { status: 400 });
  }
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  await resetRaffle(raffle.id);
  revalidatePath(`/${slug}`, 'layout');
  revalidatePath(`/admin/${slug}`, 'layout');
  return NextResponse.json({ ok: true });
}
