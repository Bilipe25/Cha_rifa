import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const { db } = await import('./index');
  const { raffles, raffleNumbers } = await import('./schema');
  const { hashPassword } = await import('../lib/password');
  const { eq } = await import('drizzle-orm');
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Defina SEED_ADMIN_PASSWORD com pelo menos 12 caracteres.');
  const slug = 'maria-antonella';
  const existing = await db.select({ id: raffles.id }).from(raffles).where(eq(raffles.slug, slug));
  if (existing.length) { console.log('Rifa já cadastrada. Seed preservado.'); return; }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.insert(raffles).values({
      id, slug, babyName: 'Maria Antonella', title: 'Chá Rifa da Maria Antonella', themeKey: slug,
      drawDate: '2026-11-22', pricePerNumberCents: 500, totalNumbers: 200,
      prizeOneCents: 10000, prizeTwoCents: 5000,
      pixKey: process.env.SEED_PIX_KEY || null,
      pixReceiverName: process.env.SEED_PIX_RECEIVER_NAME || null,
      pixReceiverCity: process.env.SEED_PIX_RECEIVER_CITY || null,
      adminPasswordHash: hashPassword(password), status: 'active', createdAt: now,
    });
    await tx.insert(raffleNumbers).values(Array.from({ length: 200 }, (_, index) => ({
      id: crypto.randomUUID(), raffleId: id, number: index + 1, status: 'available', createdAt: now, updatedAt: now,
    })));
  });
  console.log('Rifa Maria Antonella cadastrada com 200 números.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
