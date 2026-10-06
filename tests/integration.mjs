import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { runVisualCheck } from './visual-check.mjs';

const dbFile = `integration-${randomUUID()}.db`;
const url = `file:${dbFile}`;
const adminPassword = 'DisposableTestPass123!';
const sessionSecret = 'DisposableSessionSecretForIntegrationTests123456789';
const cronSecret = 'DisposableCronSecretForIntegrationTests123';
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
  if (response.headers.get('content-type')?.includes('json')) body = await response.json();
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
    cwd: process.cwd(), env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', SESSION_SECRET: sessionSecret,
      CRON_SECRET: cronSecret, DEFAULT_RAFFLE_SLUG: slug },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stderr.on('data', chunk => { serverLog += String(chunk).slice(-1000); });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/${slug}`)).ok) break; } catch { /* Starting. */ }
    if (attempt === 49) throw new Error(`Servidor de teste não iniciou: ${serverLog}`);
    await delay(200);
  }

  const reserve = async (number, phone, ip) => request(base, `/api/${slug}/reserve`, 'POST',
    { numbers: [number], name: 'Pessoa de Teste', phone }, undefined,
    ip ? { 'x-vercel-forwarded-for': ip } : {});
  const first = await reserve(1, '79999990001');
  assert.equal(first.response.status, 200);
  const firstStatus = await request(base, `/api/${slug}/payment/${first.body.reservationId}`);
  assert.equal(firstStatus.body.status, 'pending', 'consulta pública da própria reserva informa estado atual');
  assert.equal(firstStatus.response.headers.get('cache-control'), 'no-store');
  const defaultDeadline = (await client.execute({ sql: 'SELECT expires_at, created_at FROM reservations WHERE id = ?', args: [first.body.reservationId] })).rows[0];
  assert.ok(Math.abs(Date.parse(defaultDeadline.expires_at) - Date.parse(defaultDeadline.created_at) - 62 * 3600000) < 60000, 'novas reservas usam padrão de 62 horas');
  assert.equal((await request(base, `/api/${slug}/reserve`, 'POST', { numbers: Array.from({ length: 11 }, (_, i) => i + 10), name: 'Pessoa de Teste', phone: '79999990009' })).response.status, 400, 'limite de números por reserva');
  assert.equal((await reserve(1, '79999990002')).response.status, 409, 'número não pode ser reservado duas vezes');
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal((await reserve(1, '79999990150', '198.51.100.40')).response.status, 409);
  }
  const afterConflicts = await reserve(50, '79999990150', '198.51.100.40');
  assert.equal(afterConflicts.response.status, 200, 'conflitos não consomem a cota de reservas do telefone');
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
  const lateStatus = await request(base, `/api/${slug}/payment/${first.body.reservationId}`);
  assert.equal(lateStatus.body.status, 'cancelled');
  assert.equal(lateStatus.body.latePaymentReported, true);
  assert.equal((await request(base, `/api/${slug}/payment/${first.body.reservationId}`, 'POST')).body.late, true, 'aviso tardio é idempotente');

  assert.equal((await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' })).response.status, 401);
  for (let attempt = 0; attempt < 8; attempt++) await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.31' });
  assert.equal((await request(base, `/api/admin/${slug}/login`, 'POST', { password: 'wrong' }, undefined, { 'x-vercel-forwarded-for': '198.51.100.31' })).response.status, 429, 'login tem limite de tentativas');
  const login = await request(base, `/api/admin/${slug}/login`, 'POST', { password: adminPassword });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const detailPath = `/api/admin/${slug}/reservation/${afterConflicts.body.reservationId}`;
  assert.equal((await request(base, detailPath)).response.status, 401, 'detalhes administrativos exigem sessão');
  const detail = await request(base, detailPath, 'GET', undefined, cookie);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(detail.body.person.numbers, [50]);
  assert.ok(detail.body.person.events.length > 0, 'detalhes incluem histórico');
  assert.equal(detail.body.person.pixPayload, undefined, 'resposta de detalhes contém apenas os campos necessários');
  if (process.env.VISUAL_CHECK_OUTPUT) {
    const demoReservations = [];
    for (const [name, numbers, phone, status] of [
      ['Ana Silva', [7, 12], '79999990301', 'paid'],
      ['Juliana Souza', [18], '79999990302', 'pending'],
      ['Maria Clara', [25, 26, 27], '79999990303', 'paid'],
      ['Fernanda Lima', [28], '79999990304', 'pending'],
      ['Bruno Santos', [29], '79999990305', 'pending'],
    ]) {
      const item = await request(base, `/api/${slug}/reserve`, 'POST', { name, numbers, phone }, undefined, { 'x-vercel-forwarded-for': '198.51.100.80' });
      assert.equal(item.response.status, 200);
      demoReservations.push(item.body.reservationId);
      if (status === 'paid') assert.equal((await request(base, `/api/admin/${slug}/reservation/${item.body.reservationId}`, 'PATCH', { status }, cookie)).response.status, 200);
    }
    await runVisualCheck(base, slug, cookie, process.env.VISUAL_CHECK_OUTPUT);
    for (const id of demoReservations) {
      const current = await request(base, `/api/admin/${slug}/reservation/${id}`, 'GET', undefined, cookie);
      if (current.body.person.status !== 'cancelled') assert.equal((await request(base, `/api/admin/${slug}/reservation/${id}`, 'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
    }
  }
  assert.match(cookie, /^charifa_session_maria-antonella=/);
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${afterConflicts.body.reservationId}`,
    'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
  const successfulQuota = [];
  for (const number of [150, 151, 152]) {
    const booking = await reserve(number, '79999990151', '198.51.100.41');
    assert.equal(booking.response.status, 200);
    successfulQuota.push(booking.body.reservationId);
  }
  assert.equal((await reserve(153, '79999990151', '198.51.100.41')).response.status, 429,
    'somente três reservas concluídas são permitidas por telefone no dia');
  for (const id of successfulQuota) assert.equal((await request(base, `/api/admin/${slug}/reservation/${id}`,
    'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);

  const helenaId = randomUUID();
  const passwordHash = (await client.execute({ sql: 'SELECT admin_password_hash FROM raffles WHERE id = ?', args: [raffleId] })).rows[0].admin_password_hash;
  await client.execute({
    sql: `INSERT INTO raffles (id, slug, baby_name, title, theme_key, draw_date, price_per_number_cents, total_numbers,
          prize_one_cents, prize_two_cents, pix_key, pix_receiver_name, pix_receiver_city, admin_password_hash, status, created_at)
          VALUES (?, 'helena', 'Helena', 'Chá Rifa da Helena', ?, '2026-12-31', 700, 3,
          12000, 6000, '123e4567-e89b-12d3-a456-426614174000', 'TESTE CHA RIFA', 'FORTALEZA', ?, 'active', ?)`,
    args: [helenaId, slug, passwordHash, new Date().toISOString()],
  });
  const helenaLogin = await request(base, '/api/admin/helena/login', 'POST', { password: adminPassword });
  assert.equal(helenaLogin.response.status, 200);
  const helenaCookie = helenaLogin.response.headers.get('set-cookie')?.split(';')[0];
  assert.match(helenaCookie, /^charifa_session_helena=/);
  assert.equal((await request(base, detailPath, 'GET', undefined, helenaCookie)).response.status, 401, 'outra sessão não lê detalhes desta rifa');
  assert.equal((await request(base, `/api/admin/helena/reservation/${afterConflicts.body.reservationId}`, 'GET', undefined, helenaCookie)).response.status, 404, 'detalhes não atravessam rifas');
  const bothCookies = `${cookie}; ${helenaCookie}`;
  const mariaAdmin = await request(base, `/admin/${slug}`, 'GET', undefined, bothCookies);
  assert.equal(mariaAdmin.response.status, 200);
  const adminHtml = await mariaAdmin.response.text();
  assert.ok(adminHtml.includes('Compartilhar rifa'), 'painel exibe compartilhamento');
  assert.ok(adminHtml.includes('Configurações da rifa'), 'painel exibe configurações');
  assert.ok(adminHtml.includes('noindex'), 'painel não deve ser indexado');
  assert.equal((await request(base, '/admin/helena', 'GET', undefined, bothCookies)).response.status, 200, 'duas sessões coexistem');
  assert.equal((await request(base, '/api/admin/helena/settings', 'PATCH', {
    drawDate: '2026-12-31', prizeOneCents: 12000, prizeTwoCents: 6000, pricePerNumberCents: 700, totalNumbers: 3,
  }, cookie)).response.status, 401, 'sessão de uma rifa não altera outra');
  const manifest = await request(base, '/admin/helena/manifest.webmanifest');
  assert.equal(manifest.response.status, 200);
  assert.equal(manifest.body.name, 'Painel - Chá Rifa da Helena');
  assert.equal(manifest.body.start_url, '/admin/helena');
  assert.equal(manifest.body.scope, '/admin/helena');
  assert.equal(manifest.body.theme_color, '#e85c84');
  assert.equal(manifest.body.icons[0].src, '/themes/maria-antonella/icon-192.png');
  const helenaHome = await request(base, '/helena');
  const helenaHtml = await helenaHome.response.text();
  assert.ok(helenaHtml.includes('Chá Rifa da Helena'), 'metadata vem da rifa Helena');
  assert.ok(helenaHtml.includes('share.jpg'), 'Open Graph usa a arte do tema');
  assert.ok(/property="og:image" content="https?:\/\//.test(helenaHtml), 'imagem Open Graph é absoluta');
  assert.ok(!helenaHtml.includes('INSTALAR PAINEL'), 'convidados não recebem convite de instalação');
  assert.equal((await request(base, '/')).response.headers.get('location'), `/${slug}`);

  const updateSettings = data => request(base, `/api/admin/${slug}/settings`, 'PATCH', data, cookie);
  const originalPix = { pixKey: '123e4567-e89b-12d3-a456-426614174000', pixReceiverName: 'TESTE CHA RIFA', pixReceiverCity: 'FORTALEZA' };
  const initialSettings = { drawDate: '2026-12-12', prizeOneCents: 11000, prizeTwoCents: 6000,
    pricePerNumberCents: 500, totalNumbers: 250, ...originalPix };
  const pixSettings = { pixKey: 'mae.maria@example.com', pixReceiverName: ' Mãe da Maria ', pixReceiverCity: ' Aracaju ' };
  const pixField = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  for (const hours of [24, 48, 62, 86, 110]) {
    assert.equal((await updateSettings({ ...initialSettings, reservationHours: hours })).response.status, 200);
    assert.equal(Number((await client.execute({ sql: 'SELECT reservation_hours FROM raffles WHERE id = ?', args: [raffleId] })).rows[0].reservation_hours), hours);
  }
  for (const hours of [25, 63, '62', null]) {
    const invalid = await updateSettings({ ...initialSettings, reservationHours: hours });
    assert.equal(invalid.response.status, 400, 'API rejeita prazo fora das opções');
    assert.match(invalid.body.error, /24, 48, 62, 86 ou 110/);
  }
  const timed = await reserve(8, '79999990408', '198.51.100.91');
  assert.equal(timed.response.status, 200);
  const deadlineRow = async () => (await client.execute({ sql: 'SELECT expires_at, created_at, status FROM reservations WHERE id = ?', args: [timed.body.reservationId] })).rows[0];
  const timedRow = await deadlineRow();
  assert.ok(Math.abs(Date.parse(timedRow.expires_at) - Date.parse(timedRow.created_at) - 110 * 3600000) < 60000, 'reserva usa prazo escolhido');
  assert.equal((await updateSettings({ ...initialSettings, reservationHours: 48 })).response.status, 200);
  assert.equal((await deadlineRow()).expires_at, timedRow.expires_at, 'alteração preserva vencimento de reservas existentes');
  assert.equal((await updateSettings(initialSettings)).response.status, 200);
  assert.equal(Number((await client.execute({ sql: 'SELECT reservation_hours FROM raffles WHERE id = ?', args: [raffleId] })).rows[0].reservation_hours), 48, 'clientes antigos preservam prazo ao omitir campo');
  const timedPath = `/api/admin/${slug}/reservation/${timed.body.reservationId}`;
  assert.equal((await request(base, timedPath, 'PATCH', { status: 'paid' }, cookie)).response.status, 200);
  assert.equal((await deadlineRow()).expires_at, null, 'pagamento confirmado não expira');
  assert.equal((await request(base, timedPath, 'PATCH', { status: 'pending' }, cookie)).response.status, 200);
  assert.ok(Math.abs(Date.parse((await deadlineRow()).expires_at) - Date.now() - 48 * 3600000) < 60000, 'voltar a pendente usa prazo atual');
  assert.equal((await request(base, `/api/${slug}/payment/${timed.body.reservationId}`, 'POST')).response.status, 200);
  assert.equal((await updateSettings({ ...initialSettings, reservationHours: 62 })).response.status, 200);
  assert.equal((await deadlineRow()).expires_at, null, 'aviso de pagamento continua sem expiração');
  assert.equal((await deadlineRow()).status, 'payment_reported');
  assert.equal((await request(base, timedPath, 'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
  assert.equal((await updateSettings({ ...initialSettings, pricePerNumberCents: -1 })).response.status, 400);
  assert.equal((await updateSettings({ ...initialSettings, drawDate: '2026-02-31' })).response.status, 400);
  assert.equal((await updateSettings({ ...initialSettings, totalNumbers: 1001 })).response.status, 400);
  assert.equal((await updateSettings({ ...initialSettings, totalNumbers: 1 })).response.status, 400, 'dois prêmios exigem ao menos dois números');
  assert.equal((await updateSettings({ ...initialSettings, pixKey: 'x'.repeat(78) })).response.status, 400, 'chave Pix tem limite de 77 caracteres');
  assert.equal((await updateSettings({ ...initialSettings, pixKey: '123.456.789-00' })).response.status, 400, 'chave Pix inválida não pode ser gravada');
  assert.equal((await updateSettings({ ...initialSettings, pixReceiverName: 'N'.repeat(26) })).response.status, 400, 'nome Pix tem limite de 25 caracteres');
  assert.equal((await updateSettings({ ...initialSettings, pixReceiverCity: 'C'.repeat(16) })).response.status, 400, 'cidade Pix tem limite de 15 caracteres');
  assert.equal((await updateSettings({ ...initialSettings, pixReceiverName: '😀' })).response.status, 400, 'nome precisa conter texto aceito pelo Pix');
  assert.equal((await updateSettings(initialSettings)).response.status, 200);
  assert.equal(Number((await client.execute({ sql: 'SELECT COUNT(*) AS total FROM raffle_numbers WHERE raffle_id = ? AND number > 200', args: [raffleId] })).rows[0].total), 50);
  const high = await reserve(220, '79999990020');
  assert.equal(high.response.status, 200);
  const reductionBlocked = await updateSettings({ ...initialSettings, totalNumbers: 200 });
  assert.equal(reductionBlocked.response.status, 409);
  assert.match(reductionBlocked.body.error, /220/);
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${high.body.reservationId}`, 'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
  assert.equal((await updateSettings({ ...initialSettings, totalNumbers: 200 })).response.status, 200);
  assert.equal((await client.execute({ sql: 'SELECT status FROM raffle_numbers WHERE raffle_id = ? AND number = 220', args: [raffleId] })).rows[0].status, 'retired');
  assert.equal((await updateSettings(initialSettings)).response.status, 200);
  assert.equal((await client.execute({ sql: 'SELECT status FROM raffle_numbers WHERE raffle_id = ? AND number = 220', args: [raffleId] })).rows[0].status, 'available');
  const oldPrice = await reserve(5, '79999990005');
  assert.equal(oldPrice.response.status, 200);
  assert.equal(Number((await client.execute({ sql: 'SELECT total_cents FROM reservations WHERE id = ?', args: [oldPrice.body.reservationId] })).rows[0].total_cents), 500);
  assert.equal((await updateSettings({ ...initialSettings, pricePerNumberCents: 600 })).response.status, 200);
  const changedPrice = await request(base, `/api/${slug}/reserve`, 'POST',
    { numbers: [6], name: 'Pessoa de Teste', phone: '79999990006', expectedPriceCents: 500 });
  assert.equal(changedPrice.response.status, 409, 'preço desatualizado pede nova confirmação');
  assert.equal(changedPrice.body.priceCents, 600);
  const newPrice = await reserve(6, '79999990006');
  assert.equal(newPrice.response.status, 200);
  const priceRows = (await client.execute({ sql: 'SELECT id, total_cents, pix_payload FROM reservations WHERE id IN (?, ?)', args: [oldPrice.body.reservationId, newPrice.body.reservationId] })).rows;
  assert.equal(Number(priceRows.find(row => row.id === oldPrice.body.reservationId).total_cents), 500);
  assert.equal(Number(priceRows.find(row => row.id === newPrice.body.reservationId).total_cents), 600);
  assert.match(String(priceRows.find(row => row.id === oldPrice.body.reservationId).pix_payload), /54045\.00/);
  assert.match(String(priceRows.find(row => row.id === newPrice.body.reservationId).pix_payload), /54046\.00/);
  const oldPixPayload = String(priceRows.find(row => row.id === oldPrice.body.reservationId).pix_payload);
  const newPixPayload = String(priceRows.find(row => row.id === newPrice.body.reservationId).pix_payload);
  assert.ok(oldPixPayload.includes(pixField('01', originalPix.pixKey)), 'reserva anterior conserva a chave Pix anterior');
  assert.ok(oldPixPayload.includes(pixField('59', originalPix.pixReceiverName)), 'reserva anterior conserva o recebedor anterior');
  const settingsWithNewPix = { ...initialSettings, pricePerNumberCents: 600, ...pixSettings };
  assert.equal((await updateSettings(settingsWithNewPix)).response.status, 200, 'admin pode atualizar dados Pix');
  const savedPix = (await client.execute({ sql: 'SELECT pix_key, pix_receiver_name, pix_receiver_city FROM raffles WHERE id = ?', args: [raffleId] })).rows[0];
  assert.deepEqual([savedPix.pix_key, savedPix.pix_receiver_name, savedPix.pix_receiver_city],
    [pixSettings.pixKey, pixSettings.pixReceiverName.trim(), pixSettings.pixReceiverCity.trim()], 'dados Pix são salvos aparando espaços');
  const settingsPage = await request(base, `/admin/${slug}/configuracoes`, 'GET', undefined, cookie);
  const settingsHtml = await settingsPage.response.text();
  assert.equal(settingsPage.response.status, 200);
  assert.ok(settingsHtml.includes(pixSettings.pixKey) && settingsHtml.includes(pixSettings.pixReceiverName.trim()) &&
    settingsHtml.includes(pixSettings.pixReceiverCity.trim()), 'formulário exibe os dados Pix salvos');
  const currentReservation = await reserve(7, '79999990007');
  assert.equal(currentReservation.response.status, 200);
  const currentPayload = String((await client.execute({ sql: 'SELECT pix_payload FROM reservations WHERE id = ?', args: [currentReservation.body.reservationId] })).rows[0].pix_payload);
  assert.ok(currentPayload.includes(pixField('01', pixSettings.pixKey)), 'nova reserva usa nova chave Pix');
  assert.ok(currentPayload.includes(pixField('59', 'MAE DA MARIA')), 'nome do Pix é normalizado para o payload');
  assert.ok(currentPayload.includes(pixField('60', 'ARACAJU')), 'cidade do Pix é normalizada para o payload');
  assert.ok(newPixPayload.includes(pixField('01', originalPix.pixKey)), 'reserva criada antes da mudança mantém o código Pix anterior');
  assert.equal((await updateSettings({ ...settingsWithNewPix, pixKey: '' })).response.status, 400, 'chave Pix não pode ficar vazia');
  await client.execute({ sql: 'UPDATE raffles SET pix_receiver_city = ? WHERE id = ?', args: ['Campo do Brito - SE', raffleId] });
  assert.equal((await updateSettings({ ...settingsWithNewPix, pixReceiverCity: 'Campo do Brito - SE' })).response.status, 200,
    'alterações não Pix continuam possíveis com cidade legada');
  assert.equal((await updateSettings(settingsWithNewPix)).response.status, 200, 'nova cidade substitui o exemplo antigo');
  for (const item of [oldPrice, newPrice, currentReservation]) {
    assert.equal((await request(base, `/api/admin/${slug}/reservation/${item.body.reservationId}`, 'PATCH', { status: 'cancelled' }, cookie)).response.status, 200);
  }
  const homeAfterSettings = await request(base, `/${slug}`);
  assert.ok(/R\$\s?6,00/.test(await homeAfterSettings.response.text()), 'home exibe o preço novo');

  await client.execute({ sql: `INSERT INTO rate_limit_buckets (key, hits, resets_at) VALUES ('expired-test', 1, 1)` });
  assert.equal((await request(base, '/api/internal/cleanup-rate-limits')).response.status, 401);
  assert.equal((await request(base, '/api/internal/cleanup-rate-limits', 'GET', undefined, undefined,
    { Authorization: `Bearer ${cronSecret}` })).response.status, 200);
  assert.equal(Number((await client.execute({ sql: `SELECT COUNT(*) AS total FROM rate_limit_buckets WHERE key = 'expired-test'` })).rows[0].total), 0);

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
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 409,
    'pagamento tardio sem solução bloqueia sorteio');
  const resolved = await request(base, `/api/admin/${slug}/late-payment/${first.body.reservationId}`, 'POST', { note: 'Reembolso combinado com a pessoa' }, cookie);
  assert.equal(resolved.response.status, 200);
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 200);
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${second.body.reservationId}`, 'GET', undefined, cookie)).body.drawn, true, 'sheet recebe o bloqueio após sorteio');
  if (process.env.VISUAL_CHECK_OUTPUT) await runVisualCheck(base, slug, cookie, `${process.env.VISUAL_CHECK_OUTPUT}-drawn`, { drawn: true });
  const publicResult = await request(base, `/${slug}/resultado`);
  assert.equal(publicResult.response.status, 200);
  assert.equal((await publicResult.response.text()).includes('79999990002'), false, 'resultado público não deve conter telefone');
  const draws = (await client.execute({ sql: 'SELECT winning_number FROM draws ORDER BY prize_position' })).rows.map(row => Number(row.winning_number));
  assert.deepEqual(draws.sort((a, b) => a - b), [2, 3]);
  const prizeSnapshots = (await client.execute({ sql: 'SELECT prize_amount_cents FROM draws ORDER BY prize_position' })).rows.map(row => Number(row.prize_amount_cents));
  assert.deepEqual(prizeSnapshots, [11000, 6000]);
  await client.execute({ sql: 'UPDATE raffles SET prize_one_cents = 999, prize_two_cents = 999 WHERE id = ?', args: [raffleId] });
  const snapshottedResult = await request(base, `/${slug}/resultado`);
  const resultHtml = await snapshottedResult.response.text();
  assert.ok(/R\$\s?110,00/.test(resultHtml), 'resultado conserva o primeiro prêmio');
  assert.ok(/R\$\s?60,00/.test(resultHtml), 'resultado conserva o segundo prêmio');
  assert.equal((await updateSettings(settingsWithNewPix)).response.status, 409, 'configurações ficam protegidas após sorteio');
  assert.equal((await reserve(5, '79999990005')).response.status, 409, 'não aceita reservas após sorteio');
  assert.equal((await request(base, `/api/admin/${slug}/reservation/${second.body.reservationId}`, 'PATCH', { status: 'pending' }, cookie)).response.status, 409, 'não altera elegibilidade após sorteio');
  assert.equal((await request(base, `/api/admin/${slug}/draw`, 'POST', undefined, cookie)).response.status, 409, 'não repete sorteio');
  const resetPath = `/api/admin/${slug}/reset`;
  const confirmation = { confirmation: 'RESETAR' };
  assert.equal((await request(base, resetPath, 'POST', confirmation)).response.status, 401, 'reset exige autenticação');
  assert.equal((await request(base, resetPath, 'POST', confirmation, helenaCookie)).response.status, 401, 'sessão de outra rifa não pode resetar');
  assert.equal((await request(base, resetPath, 'POST', {}, cookie)).response.status, 400, 'reset exige confirmação explícita');
  assert.equal((await request(base, resetPath, 'POST', confirmation, cookie, { origin: 'https://outra-origem.example' })).response.status, 403);
  assert.equal(Number((await client.execute({ sql: 'SELECT COUNT(*) AS total FROM draws WHERE raffle_id = ?', args: [raffleId] })).rows[0].total), 2,
    'requisições recusadas preservam o sorteio');
  const beforeReset = (await client.execute({ sql: 'SELECT * FROM raffles WHERE id = ?', args: [raffleId] })).rows[0];
  const now = new Date().toISOString();
  await client.execute({ sql: `INSERT INTO raffle_numbers (id, raffle_id, number, status, created_at, updated_at) VALUES (?, ?, 251, 'retired', ?, ?)`, args: [randomUUID(), raffleId, now, now] });
  await client.execute({ sql: `INSERT INTO raffle_numbers (id, raffle_id, number, status, created_at, updated_at) VALUES (?, ?, 1, 'available', ?, ?)`, args: [randomUUID(), helenaId, now, now] });
  const otherReservation = await request(base, '/api/helena/reserve', 'POST', { numbers: [1], name: 'Outra Pessoa', phone: '79999990200' });
  assert.equal(otherReservation.response.status, 200);
  const otherRaffleBefore = (await client.execute({ sql: 'SELECT * FROM raffles WHERE id = ?', args: [helenaId] })).rows[0];
  assert.equal((await request(base, resetPath, 'POST', confirmation, cookie, { origin: base })).response.status, 200, 'pode resetar rifa sorteada');
  const afterReset = (await client.execute({ sql: 'SELECT * FROM raffles WHERE id = ?', args: [raffleId] })).rows[0];
  for (const field of Object.keys(beforeReset)) {
    if (!['status', 'closed_at', 'drawn_at'].includes(field)) assert.equal(afterReset[field], beforeReset[field], `reset preserva ${field}`);
  }
  assert.equal(afterReset.status, 'active');
  assert.equal(afterReset.closed_at, null);
  assert.equal(afterReset.drawn_at, null);
  for (const table of ['reservations', 'reservation_events', 'draws']) {
    assert.equal(Number((await client.execute({ sql: `SELECT COUNT(*) AS total FROM ${table} WHERE raffle_id = ?`, args: [raffleId] })).rows[0].total), 0, `${table} foi limpo`);
  }
  assert.equal(Number((await client.execute({ sql: 'SELECT COUNT(*) AS total FROM reservation_numbers rn JOIN raffle_numbers n ON rn.raffle_number_id = n.id WHERE n.raffle_id = ?', args: [raffleId] })).rows[0].total), 0);
  assert.equal(Number((await client.execute({ sql: "SELECT COUNT(*) AS total FROM raffle_numbers WHERE raffle_id = ? AND number <= 250 AND status = 'available' AND reservation_id IS NULL", args: [raffleId] })).rows[0].total), 250);
  assert.equal((await client.execute({ sql: 'SELECT status FROM raffle_numbers WHERE raffle_id = ? AND number = 251', args: [raffleId] })).rows[0].status, 'retired');
  assert.deepEqual((await client.execute({ sql: 'SELECT * FROM raffles WHERE id = ?', args: [helenaId] })).rows[0], otherRaffleBefore, 'outra rifa permanece intacta');
  assert.equal((await request(base, `/api/helena/payment/${otherReservation.body.reservationId}`)).body.status, 'pending');
  assert.equal((await request(base, `/api/${slug}/payment/${second.body.reservationId}`)).response.status, 404, 'links antigos deixam de existir');
  assert.equal((await reserve(2, '79999990002')).response.status, 200, 'número liberado pode ser reservado novamente');
  await client.execute({ sql: 'UPDATE raffles SET session_version = session_version + 1 WHERE id = ?', args: [raffleId] });
  assert.equal((await request(base, `/api/admin/${slug}/lifecycle`, 'POST', { action: 'reopen' }, cookie)).response.status, 401, 'troca de senha deve invalidar sessão');
  console.log('Integração passou: concorrência, consulta, expiração, Pix tardio, fechamento, sorteio, reset e sessão.');
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
