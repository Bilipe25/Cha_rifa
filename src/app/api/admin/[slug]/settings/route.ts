import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getRaffle, raffleSettingsSchema, SettingsConflictError, SettingsValidationError, updateRaffleSettings } from '@/lib/raffle';

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!await isAdmin(slug)) return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
  const input = raffleSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    const error = field === 'pixKey' ? 'Confira o formato da chave Pix.'
      : field === 'pixReceiverCity' ? 'A cidade Pix precisa ter até 15 caracteres.'
      : field === 'pixReceiverName' ? 'O nome do recebedor Pix precisa ter até 25 caracteres.'
      : field === 'reservationHours' ? 'Escolha um prazo de 24, 48, 62, 86 ou 110 horas.'
      : 'Confira a data, os valores e a quantidade (mínimo de 2 números).';
    return NextResponse.json({ error }, { status: 400 });
  }
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  try {
    await updateRaffleSettings(raffle.id, input.data);
    for (const path of [`/${slug}`, `/${slug}/numeros`, `/${slug}/reservar`, `/${slug}/resultado`, `/admin/${slug}`, `/admin/${slug}/sorteio`, `/admin/${slug}/configuracoes`]) {
      revalidatePath(path);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SettingsValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SettingsConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
