import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findReservationsByPhone } from '@/lib/raffle';
import { validPhone } from '@/lib/phone';
import { clientFingerprint, consumeRateLimits, RateLimitError } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = z.object({ phone: z.string().trim().min(10).max(30).refine(validPhone) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira o número do WhatsApp e tente novamente.' }, { status: 400 });
  try {
    await consumeRateLimits([
      { key: `lookup:${slug}:ip:${clientFingerprint(request)}`, limit: 12, windowMs: 15 * 60 * 1000 },
      { key: `lookup:${slug}:global`, limit: 300, windowMs: 15 * 60 * 1000 },
    ]);
    const reservations = await findReservationsByPhone(slug, parsed.data.phone);
    if (!reservations) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
    return NextResponse.json({ reservations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: 'Muitas consultas. Aguarde alguns minutos e tente novamente.' },
      { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } });
    return NextResponse.json({ error: 'Não conseguimos consultar agora. Tente novamente mais tarde.' }, { status: 500 });
  }
}
