import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/auth';

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await clearAdminSession(slug);
  return NextResponse.json({ ok: true });
}
