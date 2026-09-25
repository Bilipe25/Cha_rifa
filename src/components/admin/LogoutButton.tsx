'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton({ slug }: { slug: string }) {
  const router = useRouter();
  async function logout() {
    await fetch(`/api/admin/${slug}/logout`, { method: 'POST' });
    router.replace(`/admin/${slug}/login`); router.refresh();
  }
  return <button className="logout-button" type="button" onClick={logout}>Sair do painel</button>;
}
