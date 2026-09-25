import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { raffles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from './password';

const cookieName = 'charifa_session';

export { verifyPassword } from './password';

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres');
  return process.env.SESSION_SECRET;
}

function signature(value: string) { return createHmac('sha256', secret()).update(value).digest('hex'); }

export async function setAdminSession(slug: string) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const value = `${slug}.${expires}`;
  (await cookies()).set(cookieName, `${value}.${signature(value)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: new Date(expires),
  });
}

export async function clearAdminSession() { (await cookies()).delete(cookieName); }

export async function isAdmin(slug: string) {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  const [savedSlug, expires, mac] = token.split('.');
  if (savedSlug !== slug || !expires || !mac || Number(expires) < Date.now()) return false;
  const actual = Buffer.from(mac, 'hex');
  const expected = Buffer.from(signature(`${savedSlug}.${expires}`), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function requireAdmin(slug: string) {
  if (!await isAdmin(slug)) redirect(`/admin/${slug}/login`);
  const [raffle] = await db.select().from(raffles).where(eq(raffles.slug, slug));
  if (!raffle) redirect('/');
  return raffle;
}
