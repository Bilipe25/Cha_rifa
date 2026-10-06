import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createClient } from '@libsql/client';

test('migração ajusta reservas antigas pendentes para 62 horas e preserva outros estados', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
    const executeMigration = async entry => {
      const sql = await readFile(`drizzle/${entry.tag}.sql`, 'utf8');
      for (const statement of sql.split('--> statement-breakpoint').filter(value => value.trim())) await client.execute(statement);
    };
    for (const entry of journal.entries.filter(entry => entry.idx < 4)) await executeMigration(entry);
    for (const [id, status] of [['active', 'active'], ['drawn', 'drawn']]) {
      await client.execute({ sql: `INSERT INTO raffles (id, slug, baby_name, title, theme_key, draw_date,
        price_per_number_cents, total_numbers, prize_one_cents, prize_two_cents, admin_password_hash, status, created_at)
        VALUES (?, ?, 'Teste', 'Teste', 'teste', '2026-12-31', 500, 200, 10000, 5000, 'test', ?, '2026-10-01T00:00:00.000Z')`, args: [id, id, status] });
    }
    for (const [id, status, raffle, reported, paid, deadline] of [
      ['pending', 'pending', 'active', null, null, '2026-10-02T00:00:00.000Z'],
      ['legacy', 'pending', 'active', null, null, null],
      ['reported', 'payment_reported', 'active', '2026-10-01T01:00:00.000Z', null, null],
      ['paid', 'paid', 'active', null, '2026-10-01T01:00:00.000Z', null],
      ['cancelled', 'cancelled', 'active', null, null, '2026-10-02T00:00:00.000Z'],
      ['drawn', 'pending', 'drawn', null, null, '2026-10-02T00:00:00.000Z'],
    ]) {
      await client.execute({ sql: `INSERT INTO reservations (id, raffle_id, participant_name, phone, phone_normalized,
        status, total_cents, pix_txid, pix_payload, payment_reported_at, paid_at, expires_at, created_at)
        VALUES (?, ?, 'Teste', '79999999999', '79999999999', ?, 500, 'TEST', 'TEST', ?, ?, ?, '2026-10-01T00:00:00.000Z')`,
        args: [id, raffle, status, reported, paid, deadline] });
    }
    await executeMigration(journal.entries.find(entry => entry.idx === 4));
    const rows = (await client.execute('SELECT id, status, expires_at FROM reservations')).rows;
    const byId = Object.fromEntries(rows.map(row => [row.id, row]));
    for (const id of ['pending', 'legacy']) assert.equal(byId[id].expires_at, '2026-10-03T14:00:00.000Z');
    for (const id of ['reported', 'paid']) assert.equal(byId[id].expires_at, null);
    for (const id of ['cancelled', 'drawn']) assert.equal(byId[id].expires_at, '2026-10-02T00:00:00.000Z');
    assert.equal(byId.cancelled.status, 'cancelled', 'não reativa números já liberados');
    assert.equal((await client.execute('SELECT COUNT(*) AS total FROM reservation_events')).rows[0].total, 2);
    assert.equal((await client.execute("SELECT reservation_hours FROM raffles WHERE id = 'active'")).rows[0].reservation_hours, 62);
  } finally { client.close(); }
});
