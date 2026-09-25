import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRaffle } from '@/lib/raffle';
import { setAdminSession, verifyPassword } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const input = z.object({ password: z.string().min(1).max(200) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Digite a senha para continuar.' }, { status: 400 });
  const raffle = await getRaffle(slug);
  if (!raffle || !verifyPassword(input.data.password, raffle.adminPasswordHash)) {
    return NextResponse.json({ error: 'Senha incorreta. Tente novamente.' }, { status: 401 });
  }
  await setAdminSession(slug);
  return NextResponse.json({ ok: true });
}
