import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/auth';
import { getRaffle, resolveLatePayment } from '@/lib/raffle';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; reservationId: string }> }) {
  const { slug, reservationId } = await params;
  if (!await isAdmin(slug)) return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
  const parsed = z.object({ note: z.string().trim().min(8).max(300) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Descreva como o pagamento foi resolvido.' }, { status: 400 });
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  try {
    await resolveLatePayment(raffle.id, reservationId, parsed.data.note);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível registrar a solução.' }, { status: 409 }); }
}
