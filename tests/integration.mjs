import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const dbFile = `integration-${randomUUID()}.db`;
const url = `file:${dbFile}`;
const adminPassword = 'DisposableTestPass123!';
const sessionSecret = 'DisposableSessionSecretForIntegrationTests123456789';
const slug = 'maria-antonella';
const raffleId = randomUUID();
const client = createClient({ url });
let server;

async function freePort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function request(base, path, method = 'GET', data, cookie, extraHeaders = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    body: data ? JSON.stringify(data) : undefined,
    redirect: 'manual',
  });
  let body;
  if (response.headers.get('content-type')?.includes('application/json')) body = await response.json();
  return { response, body };
}

async function seed() {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${scryptSync(adminPassword, salt, 64).toString('hex')}`;
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO raffles (id, slug, baby_name, title, theme_key, draw_date, price_per_number_cents, total_numbers,
          prize_one_cents, prize_two_cents, pix_key, pix_receiver_name, pix_receiver_city, admin_password_hash, status, created_at)
          VALUES (?, ?, 'Maria Antonella', 'Chá Rifa da Maria Antonella', ?, '2026-11-22', 500, 200,
          10000, 5000, '123e4567-e89b-12d3-a456-426614174000', 'TESTE CHA RIFA', 'FORTALEZA', ?, 'active', ?)`,
    args: [raffleId, slug, slug, passwordHash, now],
  });
  const transaction = await client.transaction('write');
  try {
    for (let number = 1; number <= 200; number++) await transaction.execute({
      sql: `INSERT INTO raffle_numbers (id, raffle_id, number, status, created_at, updated_at) VALUES (?, ?, ?, 'available', ?, ?)`,
      args: [randomUUID(), raffleId, number, now, now],
    });
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}

async function main() {
  await seed();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(), env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', SESSION_SECRET: sessionSecret },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stderr.on('data', chunk => { serverLog += String(chunk).slice(-1000); });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/${slug}`)).ok) break; } catch { /* Starting. */ }
    if (attempt === 49) throw new Error(`Servidor de teste não iniciou: ${serverLog}`);
    await delay(200);
  }

  const reserve = async (number, phone) => request(base, `/api/${slug}/reserve`, 'POST', { numbers: [number], name: 'Pessoa de Teste', phone });
  const first = await reserve(1, '79999990001');
  assert.equal(first.response.status, 200);
  assert.equal((await request(base, `/api/${slug}/reserve`, 'POST', { numbers: Array.from({ length: 11 }, (_, i) => i + 10), name: 'Pessoa de Teste', phone: '79999990009' })).response.status, 400, 'limite de números por reserva');
  assert.equal((await reserve(1, '79999990002')).response.status, 409, 'número não pode ser reservado duas vezes');
  const lookup = await request(base, `/api/${slug}/my-numbers`, 'POST', { phone: '79999990001' });
  assert.equal(lookup.response.status, 200);
  assert.deepEqual(lookup.body.reservations[0].numbers, [1]);
  assert.equal(lookup.body.reservations[0].name, undefined, 'consulta não deve expor nome');
  for (let attempt = 0; attempt < 12; attempt++) await request(base, `/api/${slug}/my-numbers`, 'POST', { phone: '79999990001' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.30' });
  assert.equal((await request(base, `/api/${slug}/my-numbers`, 'POST', { phone: '79999990001' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.30' })).response.status, 429, 'consulta por telefone tem limite');

  await client.execute({ sql: `UPDATE reservations SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`, args: [first.body.reservationId] });
  const numbers = await request(base, `/api/${slug}/numbers`);
  assert.equal(numbers.body.occupied.includes(1), false, 'reserva vencida deve liberar o número');
  const late = await request(base, `/api/${slug}/payment/${first.body.reservationId}`, 'POST');
  assert.deepEqual(late.body, { ok: true, late: true });
  const [lateRow] = (await client.execute({ sql: 'SELECT status, late_payment_reported_at FROM reservations WHERE id = ?', args: [first.body.reservationId] })).rows;
  assert.equal(lateRow.status, 'cancelled');
  assert.ok(lateRow.late_payment_reported_at);
  assert.equal((await request(base, `/api/${slug}/payment/${first.body.reservationId}`, 'POST')).body.late, true, 'aviso tardio é idempotente');

  assert.equal((await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' })).response.status, 401);
  for (let attempt = 0; attempt < 8; attempt++) await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.31' });
  assert.equal((await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.31' })).response.status, 429, 'login tem limite de tentativas');
  const login = await request(base, `/api/admin/${slug}/login`, 'POST', { password: adminPassword });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const resolved = await request(base, `/api/admin/${slug}/late-payment/${first.body.reservationId}`, 'POST', { note: 'Reembolso combinado com a pessoa' }, cookie);
  assert.equal(resolved.response.status, 200);

  const close = await request(base, `/api/admin/${slug}/lifecycle`, 'POST', { action: 'close' }, cookie);
  assert.equal(close.response.status, 200);
  assert.equal((await reserve(2, '79999990002')).response.status, 409, 'rifa encerrada bloqueia reserva');
  const earlyDraw = await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie);
  assert.equal(earlyDraw.response.status, 409, 'sorteio antes da data deve falhar');
  assert.match(earlyDraw.body.error, /data anunciada/);
  assert.equal((await request(base, `/api/admin/${slug}/lifecycle`, 'POST', { action: 'reopen' }, cookie)).response.status, 200);

  const second = await reserve(2, '79999990002');
  const third = await reserve(3, '79999990003');
  const pending = await reserve(4, '79999990004');
  for (const item of [second, third, pending]) assert.equal(item.response.status, 200);
  for (const item of [second, third]) {
    const paid = await request(base, `/api/admin/${slug}/reservation/${item.body.reservationId}`, 'PATCH', { status: 'paid' }, cookie);
    assert.equal(paid.response.status, 200);
  }
  await request(base, `/api/admin/${slug}/lifecycle`, 'POST', { action: 'close' }, cookie);
  await client.execute({ sql: `UPDATE raffles SET draw_date = '2020-01-01' WHERE id = ?`, args: [raffleId] });
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 409, 'pagamento pendente bloqueia sorteio');
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${pending.body.reservationId}`, 'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 200);
  const publicResult = await request(base, `/${slug}/resultado`);
  assert.equal(publicResult.response.status, 200);
  assert.equal((await publicResult.response.text()).includes('79999990002'), false, 'resultado público não deve conter telefone');
  const draws = (await client.execute({ sql: 'SELECT winning_number FROM draws ORDER BY prize_position' })).rows.map(row => Number(row.winning_number));
  assert.deepEqual(draws.sort((a, b) => a - b), [2, 3]);
  assert.equal((await reserve(5, '79999990005')).response.status, 409, 'não aceita reservas após sorteio');
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${second.body.reservationId}`, 'PATCH', { status: 'pending' }, cookie)).response.status, 409, 'não altera elegibilidade após sorteio');
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 409, 'não repete sorteio');
  await client.execute({ sql: 'UPDATE raffles SET session_version = session_version + 1 WHERE id = ?', args: [raffleId] });
  assert.equal((await request(base, `/api/admin/${slug}/lifecycle`, 'POST', { action: 'reopen' }, cookie)).response.status, 401, 'troca de senha deve invalidar sessão');
  console.log('Integração passou: concorrência, consulta, expiração, Pix tardio, fechamento, sorteio e sessão.');
}

try { await main(); }
finally {
  if (server && !server.killed) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); }
      catch { server.kill(); }
    } else server.kill();
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(2000)]);
  }
  await client.close();
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await rm(dbFile, { force: true }); break; }
    catch (error) {
      if (error.code !== 'EBUSY') throw error;
      if (attempt === 19) {
        const cleanup = spawn(process.execPath, ['tests/cleanup-file.mjs', dbFile], {
          cwd: process.cwd(), detached: true, windowsHide: true, stdio: 'ignore',
        });
        cleanup.unref();
        break;
      }
      await delay(200);
    }
  }
}
