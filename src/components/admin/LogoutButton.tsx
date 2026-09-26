'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function logout() {
    setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/logout`, { method: 'POST' });
      if (!response.ok) throw new Error();
      router.replace(`/admin/${slug}/login`); router.refresh();
    } catch { setError('Não foi possível sair agora. Confira sua conexão e tente novamente.'); }
  }
  return <>{error && <p className="inline-notice" role="alert">{error}</p>}<button className="logout-button" type="button" onClick={logout}>Sair do painel</button></>;
}
