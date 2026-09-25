import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createReservation, PixUnavailableError, UnavailableNumbersError } from '@/lib/raffle';
import { validPhone } from '@/lib/phone';

const input = z.object({
  numbers: z.array(z.number().int().min(1).max(10000)).min(1).max(200),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(30).refine(validPhone),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira seus dados e tente novamente.' }, { status: 400 });
  try {
    const reservationId = await createReservation(slug, parsed.data.numbers, parsed.data.name, parsed.data.phone);
    return NextResponse.json({ reservationId });
  } catch (error) {
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
