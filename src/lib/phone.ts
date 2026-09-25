export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

export function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function validPhone(value: string) {
  const digits = normalizePhone(value);
  return /^[1-9]{2}9?[0-9]{8}$/.test(digits) && !/^(\d)\1+$/.test(digits);
}
