import { NextResponse } from 'next/server';
import { getReservation, reportPayment } from '@/lib/raffle';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; reservationId: string }> }) {
  const { slug, reservationId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reservationId)) return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
  const reservation = await getReservation(slug, reservationId);
  if (!reservation) return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
  return NextResponse.json({
    status: reservation.status, expiresAt: reservation.expiresAt, cancelReason: reservation.cancelReason,
    latePaymentReported: Boolean(reservation.latePaymentReportedAt),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string; reservationId: string }> }) {
  const { slug, reservationId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reservationId)) return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
  const ok = await reportPayment(slug, reservationId);
  return ok === 'missing' ? NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 })
    : NextResponse.json({ ok: true, late: ok === 'late' });
}
