import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePixKey } from '../src/lib/pix-key.ts';

test('normaliza telefone brasileiro para o formato internacional do BR Code', () => {
  assert.equal(normalizePixKey('5579999999999'), '+5579999999999');
  assert.equal(normalizePixKey('(79) 99999-9999'), '+5579999999999');
  assert.equal(normalizePixKey('+5579999999999'), '+5579999999999');
});

test('aceita CPF, CNPJ, e-mail e chave aleatória em formatos válidos', () => {
  assert.equal(normalizePixKey('529.982.247-25'), '52998224725');
  assert.equal(normalizePixKey('04.252.011/0001-10'), '04252011000110');
  assert.equal(normalizePixKey('mae@example.com'), 'mae@example.com');
  assert.equal(normalizePixKey('123e4567-e89b-12d3-a456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
});

test('rejeita documentos e valores que parecem chaves mas não são válidos', () => {
  for (const key of ['123.456.789-00', '11111111111', 'qualquer texto', '551234', 'x'.repeat(78)]) {
    assert.equal(normalizePixKey(key), null, key);
  }
});
