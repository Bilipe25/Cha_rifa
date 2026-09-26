import { normalizePixMerchantText } from './pix-format';
import { normalizePixKey } from './pix-key';

function field(id: string, value: string) {
  if (value.length > 99) throw new Error('Campo Pix muito longo');
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(value: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function createPixPayload({ key, receiverName, city, amountCents, txid }: {
  key: string; receiverName: string; city: string; amountCents: number; txid: string;
}) {
  const normalizedKey = normalizePixKey(key);
  if (!normalizedKey || !receiverName.trim() || !city.trim() || amountCents < 1) throw new Error('Pix não configurado');
  const merchantAccount = field('00', 'br.gov.bcb.pix') + field('01', normalizedKey);
  const payload = field('00', '01') + field('26', merchantAccount) + field('52', '0000') + field('53', '986') +
    field('54', (amountCents / 100).toFixed(2)) + field('58', 'BR') + field('59', normalizePixMerchantText(receiverName).slice(0, 25)) +
    field('60', normalizePixMerchantText(city).slice(0, 15)) + field('62', field('05', normalizePixMerchantText(txid).slice(0, 25))) + '6304';
  return payload + crc16(payload);
}
