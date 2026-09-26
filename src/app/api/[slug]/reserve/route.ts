import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createReservation, PixUnavailableError, PriceChangedError, RaffleClosedError, UnavailableNumbersError } from '@/lib/raffle';
import { MAX_NUMBERS_PER_RESERVATION } from '@/config/limits';
import { validPhone } from '@/lib/phone';
import { clientFingerprint, consumeRateLimits, RateLimitError } from '@/lib/rate-limit';

const input = z.object({
  numbers: z.array(z.number().int().min(1).max(10000)).min(1).max(MAX_NUMBERS_PER_RESERVATION),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(30).refine(validPhone),
  expectedPriceCents: z.number().int().positive().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira seus dados e tente novamente.' }, { status: 400 });
  try {
    const day = 24 * 60 * 60 * 1000;
    await consumeRateLimits([
      { key: `reserve:${slug}:ip:${clientFingerprint(request)}`, limit: 15, windowMs: day },
      { key: `reserve:${slug}:global`, limit: 250, windowMs: day },
    ]);
    const reservationId = await createReservation(slug, parsed.data.numbers, parsed.data.name, parsed.data.phone, parsed.data.expectedPriceCents);
    return NextResponse.json({ reservationId });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: `Limite de reservas ou tentativas atingido. Tente novamente em cerca de ${Math.ceil(error.retryAfterSeconds / 3600)} hora(s).` },
      { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } });
    if (error instanceof PriceChangedError) return NextResponse.json({ error: error.message, code: 'price_changed', priceCents: error.priceCents }, { status: 409 });
    if (error instanceof RaffleClosedError) return NextResponse.json({ error: 'As reservas desta rifa foram encerradas.' }, { status: 409 });
    if (error instanceof UnavailableNumbersError) {
      return NextResponse.json({ error: 'Alguns números acabaram de ser escolhidos por outra pessoa. Atualizamos a lista para você.', code: 'unavailable' }, { status: 409 });
    }
    if (error instanceof Error && /SQLITE_BUSY|database is locked/i.test(error.message)) {
      return NextResponse.json({ error: 'Alguns números acabaram de ser escolhidos por outra pessoa. Atualizamos a lista para você.', code: 'unavailable' }, { status: 409 });
    }
    if (error instanceof PixUnavailableError) {
      return NextResponse.json({ error: 'O pagamento ainda não está disponível. Tente novamente mais tarde.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Não conseguimos concluir agora. Tente novamente em alguns instantes.' }, { status: 500 });
  }
}
