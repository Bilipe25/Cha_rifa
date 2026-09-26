import { NextResponse } from 'next/server';
import { reportPayment } from '@/lib/raffle';

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string; reservationId: string }> }) {
  const { slug, reservationId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reservationId)) return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
  const ok = await reportPayment(slug, reservationId);
  return ok === 'missing' ? NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 })
    : NextResponse.json({ ok: true, late: ok === 'late' });
}
