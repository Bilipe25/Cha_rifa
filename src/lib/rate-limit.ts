import 'server-only';
import { createHmac } from 'node:crypto';
import { client } from '@/db';

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) { super('Tente novamente mais tarde.'); }
}

function fingerprint(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function clientFingerprint(request: Request) {
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  return fingerprint(ip);
}

export function privateFingerprint(value: string) { return fingerprint(value); }

export async function consumeRateLimits(rules: { key: string; limit: number; windowMs: number }[]) {
  const now = Date.now();
  for (const rule of rules) {
    const resetsAt = now + rule.windowMs;
    const result = await client.execute({
      sql: `INSERT INTO rate_limit_buckets (key, hits, resets_at) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET
              hits = CASE WHEN resets_at <= ? THEN 1 ELSE hits + 1 END,
              resets_at = CASE WHEN resets_at <= ? THEN ? ELSE resets_at END
            RETURNING hits, resets_at`,
      args: [rule.key, resetsAt, now, now, resetsAt],
    });
    const row = result.rows[0];
    if (Number(row.hits) > rule.limit) {
      throw new RateLimitError(Math.max(1, Math.ceil((Number(row.resets_at) - now) / 1000)));
    }
  }
}

export async function cleanupExpiredRateLimitBuckets(now = Date.now()) {
  const result = await client.execute({
    sql: 'DELETE FROM rate_limit_buckets WHERE resets_at < ?',
    args: [now],
  });
  return result.rowsAffected;
}
