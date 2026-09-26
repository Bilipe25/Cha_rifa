import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { ThemeFrame } from '@/components/theme/ThemeFrame';
import { PixPayment } from '@/components/raffle/PixPayment';
import { getTheme } from '@/config/themes';
import { getRaffle, getReservation } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export default async function PixPage({ params }: { params: Promise<{ slug: string; reservationId: string }> }) {
  const { slug, reservationId } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle || !getTheme(raffle.themeKey)) notFound();
  const reservation = await getReservation(slug, reservationId);
  if (!reservation) notFound();
  const qr = await QRCode.toDataURL(reservation.pixPayload, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
  return <ThemeFrame themeKey={raffle.themeKey} kind="guest">
    <h1 className="sr-only">{raffle.title}</h1>
    <PixPayment slug={slug} reservationId={reservationId} numbers={reservation.numbers}
      totalCents={reservation.totalCents} payload={reservation.pixPayload} qr={qr} status={reservation.status}
      expiresAt={reservation.expiresAt} cancelReason={reservation.cancelReason}
      latePaymentReported={Boolean(reservation.latePaymentReportedAt)} />
  </ThemeFrame>;
}
