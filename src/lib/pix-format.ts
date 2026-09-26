export function normalizePixMerchantText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').trim().toUpperCase();
}
