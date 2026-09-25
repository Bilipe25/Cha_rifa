'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';

export function AdminLogin({ slug }: { slug: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/${slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Não foi possível entrar.'); return; }
      router.replace(`/admin/${slug}`); router.refresh();
    } catch { setError('Não foi possível entrar agora. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form className="admin-login panel-flow" onSubmit={submit}>
    <div className="panel-heading"><h2>Bem-vinda, mamãe!</h2><p>Digite sua senha para acompanhar a rifa.</p></div>
    <label className="field-label">Senha<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></label>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}><Icon name="lock"/><span>{busy ? 'ENTRANDO...' : 'ENTRAR NO PAINEL'}</span><Icon name="arrow"/></button>
  </form>;
}
