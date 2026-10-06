import { RESERVATION_HOURS } from '@/config/limits';

export class UnavailableNumbersError extends Error {}
export class PixUnavailableError extends Error {}
export class RaffleClosedError extends Error {}

export { MAX_NUMBERS_PER_RESERVATION, RESERVATION_HOURS } from '@/config/limits';

export function reservationDeadline(hours = RESERVATION_HOURS) { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(); }

export function todayInFortaleza() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
