import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/auth';
import { getRaffle, setRaffleClosed } from '@/lib/raffle';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!await isAdmin(slug)) return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
  const parsed = z.object({ action: z.enum(['close', 'reopen']) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  try {
    await setRaffleClosed(raffle.id, parsed.data.action === 'close');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar a rifa.' }, { status: 409 });
  }
}
