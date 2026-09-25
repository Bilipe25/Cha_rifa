import { NextResponse } from 'next/server';
import { getNumberAvailability, getRaffle } from '@/lib/raffle';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  const numbers = await getNumberAvailability(raffle.id);
  return NextResponse.json({ occupied: numbers.filter(item => item.status !== 'available').map(item => item.number) },
    { headers: { 'Cache-Control': 'no-store' } });
}
