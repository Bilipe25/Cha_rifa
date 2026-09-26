import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const { db } = await import('./index');
  const { raffles } = await import('./schema');
  const { hashPassword } = await import('../lib/password');
  const { normalizePixKey } = await import('../lib/pix-key');
  const { normalizePixMerchantText } = await import('../lib/pix-format');
  const { eq, sql } = await import('drizzle-orm');
  const slug = process.env.RAFFLE_SLUG || 'maria-antonella';
  const [raffle] = await db.select({ id: raffles.id }).from(raffles).where(eq(raffles.slug, slug));
  if (!raffle) throw new Error(`Rifa ${slug} não encontrada. Execute o seed primeiro.`);
  const changes: Partial<typeof raffles.$inferInsert> = {};
  const pixValues = [process.env.SEED_PIX_KEY, process.env.SEED_PIX_RECEIVER_NAME, process.env.SEED_PIX_RECEIVER_CITY];
  if (pixValues.some(Boolean)) {
    if (!pixValues.every(Boolean)) throw new Error('Preencha as três variáveis SEED_PIX_* para configurar Pix.');
    const key = normalizePixKey(process.env.SEED_PIX_KEY!);
    const name = process.env.SEED_PIX_RECEIVER_NAME!.trim();
    const city = process.env.SEED_PIX_RECEIVER_CITY!.trim();
    if (!key || !name || name.length > 25 || !city || city.length > 15 ||
      !normalizePixMerchantText(name) || !normalizePixMerchantText(city)) {
      throw new Error('Confira o formato da chave Pix, o nome (até 25) e a cidade (até 15 caracteres).');
    }
    changes.pixKey = key;
    changes.pixReceiverName = name;
    changes.pixReceiverCity = city;
  }
  if (process.env.SEED_ADMIN_PASSWORD) {
    if (process.env.SEED_ADMIN_PASSWORD.length < 12) throw new Error('SEED_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.');
    changes.adminPasswordHash = hashPassword(process.env.SEED_ADMIN_PASSWORD);
  }
  if (!Object.keys(changes).length) throw new Error('Defina os dados Pix ou a senha nas variáveis de ambiente.');
  await db.update(raffles).set({
    ...changes,
    ...(process.env.SEED_ADMIN_PASSWORD ? { sessionVersion: sql`${raffles.sessionVersion} + 1` } : {}),
  }).where(eq(raffles.id, raffle.id));
  console.log(`Configuração da rifa ${slug} atualizada.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
