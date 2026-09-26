import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRaffle } from '@/lib/raffle';
import { setAdminSession, verifyPassword } from '@/lib/auth';
import { clientFingerprint, consumeRateLimits, RateLimitError } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const input = z.object({ password: z.string().min(1).max(200) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Digite a senha para continuar.' }, { status: 400 });
  try {
    await consumeRateLimits([
      { key: `login:${slug}:ip:${clientFingerprint(request)}`, limit: 8, windowMs: 15 * 60 * 1000 },
      { key: `login:${slug}:global`, limit: 150, windowMs: 15 * 60 * 1000 },
    ]);
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de entrar.' },
      { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } });
    throw error;
  }
  const raffle = await getRaffle(slug);
  if (!raffle || !verifyPassword(input.data.password, raffle.adminPasswordHash)) {
    return NextResponse.json({ error: 'Senha incorreta. Tente novamente.' }, { status: 401 });
  }
  await setAdminSession(slug, raffle.sessionVersion);
  return NextResponse.json({ ok: true });
}
