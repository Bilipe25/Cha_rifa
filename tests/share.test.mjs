import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicShareUrl, buildShareText } from '../src/lib/share/raffle-share.ts';

test('compartilhamento usa o caminho público da rifa', () => {
  assert.equal(buildPublicShareUrl('https://example.com/admin/maria-antonella', 'helena'), 'https://example.com/helena');
  assert.equal(buildPublicShareUrl('https://example.com', 'maria-antonella'), 'https://example.com/maria-antonella');
});

test('mensagem usa o nome da rifa escolhida', () => {
  const text = buildShareText({ title: 'Chá Rifa da Helena' });
  assert.match(text, /Chá-Rifa da Helena/);
  assert.doesNotMatch(text, /Maria Antonella|\/admin\//);
  assert.match(buildShareText({ title: 'Chá Rifa do Arthur' }), /Chá-Rifa do Arthur/);
});
