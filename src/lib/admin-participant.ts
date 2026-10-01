export type AdminParticipantEvent = {
  fromStatus: string | null; toStatus: string; actor: string; note: string | null; createdAt: string;
};
export type AdminParticipant = {
  id: string; name: string; phone: string; phoneNormalized: string; numbers: number[]; status: string;
  totalCents: number; createdAt: string; expiresAt: string | null;
  latePaymentReportedAt: string | null; latePaymentResolvedAt: string | null;
  events: AdminParticipantEvent[];
};
export const participantStatusLabels: Record<string, string> = {
  pending: 'Pendente', payment_reported: 'A conferir', paid: 'Pago', cancelled: 'Liberado',
};
export const participantDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
}).format(new Date(value));
