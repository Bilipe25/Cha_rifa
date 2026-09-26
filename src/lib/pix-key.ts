/** Converts a recipient's key to the representation required inside a Pix BR Code. */
export function normalizePixKey(value: string): string | null {
  const key = value.trim();
  if (!key || key.length > 77) return null;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return key;
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) return key.toLowerCase();

  const digits = key.replace(/\D/g, '');
  if ((digits.length === 11 || digits.length === 14) && /^[\d.\-/]+$/.test(key) && validDocument(digits)) {
    return digits;
  }
  if (/^\+?55\d{10,11}$/.test(key)) return `+${digits}`;
  if (/^[()\d\s.-]+$/.test(key) && /^[1-9]\d9\d{8}$/.test(digits)) {
    return `+55${digits}`;
  }
  return null;
}

function validDocument(digits: string) {
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11) {
    for (let length = 9; length <= 10; length++) {
      const total = [...digits.slice(0, length)].reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0);
      const check = (total * 10) % 11 % 10;
      if (check !== Number(digits[length])) return false;
    }
    return true;
  }
  if (digits.length === 14) {
    for (let length = 12; length <= 13; length++) {
      const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const total = [...digits.slice(0, length)].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
      const rest = total % 11;
      if ((rest < 2 ? 0 : 11 - rest) !== Number(digits[length])) return false;
    }
    return true;
  }
  return false;
}
