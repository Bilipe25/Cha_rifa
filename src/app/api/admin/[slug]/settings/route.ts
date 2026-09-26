import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getRaffle, raffleSettingsSchema, SettingsConflictError, updateRaffleSettings } from '@/lib/raffle';

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!await isAdmin(slug)) return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
  const input = raffleSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Confira a data, os valores, a quantidade e os dados Pix.' }, { status: 400 });
  const raffle = await getRaffle(slug);
  if (!raffle) return NextResponse.json({ error: 'Rifa não encontrada.' }, { status: 404 });
  try {
    await updateRaffleSettings(raffle.id, input.data);
    for (const path of [`/${slug}`, `/${slug}/numeros`, `/${slug}/reservar`, `/${slug}/resultado`, `/admin/${slug}`, `/admin/${slug}/sorteio`, `/admin/${slug}/configuracoes`]) {
      revalidatePath(path);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SettingsConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
