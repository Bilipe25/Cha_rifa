import assert from 'node:assert/strict';
import test from 'node:test';
import { createPixPayload } from '../src/lib/pix.ts';

function parseTlv(input) {
  const fields = new Map();
  let cursor = 0;
  while (cursor < input.length) {
    const id = input.slice(cursor, cursor + 2);
    const length = Number(input.slice(cursor + 2, cursor + 4));
    assert.match(id, /^\d{2}$/);
    assert.ok(Number.isInteger(length) && length >= 0);
    const end = cursor + 4 + length;
    assert.ok(end <= input.length, `Campo ${id} ultrapassa o payload`);
    fields.set(id, input.slice(cursor + 4, end));
    cursor = end;
  }
  assert.equal(cursor, input.length);
  return fields;
}

function independentCrc(input) {
  const bytes = new TextEncoder().encode(input);
  let register = 0xffff;
  for (const byte of bytes) {
    for (let shift = 7; shift >= 0; shift--) {
      const incomingBit = (byte >> shift) & 1;
      const outgoingBit = (register >> 15) & 1;
      register = (register << 1) & 0xffff;
      if (incomingBit !== outgoingBit) register ^= 0x1021;
    }
  }
  return register.toString(16).toUpperCase().padStart(4, '0');
}

for (const [cents, amount] of [[500, '5.00'], [1500, '15.00'], [5000, '50.00'], [10000, '100.00']]) {
  test(`Pix de ${amount} BRL tem BR Code válido`, () => {
    const payload = createPixPayload({
      key: '123e4567-e89b-12d3-a456-426614174000',
      receiverName: 'Mãe da Maria',
      city: 'Fortaleza',
      amountCents: cents,
      txid: 'TESTE123',
    });
    assert.ok(payload.startsWith('000201'));
    assert.match(payload, /6304[0-9A-F]{4}$/);
    const fields = parseTlv(payload);
    const account = parseTlv(fields.get('26'));
    const additional = parseTlv(fields.get('62'));
    assert.equal(fields.get('00'), '01');
    assert.equal(account.get('00'), 'br.gov.bcb.pix');
    assert.equal(account.get('01'), '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(fields.get('52'), '0000');
    assert.equal(fields.get('53'), '986');
    assert.equal(fields.get('54'), amount);
    assert.equal(fields.get('58'), 'BR');
    assert.equal(fields.get('59'), 'MAE DA MARIA');
    assert.equal(fields.get('60'), 'FORTALEZA');
    assert.equal(additional.get('05'), 'TESTE123');
    assert.equal(fields.get('63'), independentCrc(payload.slice(0, -4)));
  });
}
