import { cleanupExpiredRateLimitBuckets } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  await cleanupExpiredRateLimitBuckets();
  return Response.json({ ok: true });
}
