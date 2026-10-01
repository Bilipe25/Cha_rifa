'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ResetRaffleButton({ slug, disabled = false }: { slug: string; disabled?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function open() {
    setConfirmation(''); setError(''); setSuccess(false);
    dialog.current?.showModal();
  }
  async function reset() {
    if (busy || confirmation !== 'RESETAR') return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/${encodeURIComponent(slug)}/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      if (response.status === 401) { dialog.current?.close(); router.replace(`/admin/${slug}/login`); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível resetar a rifa.');
      setSuccess(true);
      dialog.current?.close();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confira sua conexão e tente novamente.');
    } finally { setBusy(false); }
  }

  return <section className="raffle-reset-section" aria-labelledby="raffle-reset-heading">
    <h3 id="raffle-reset-heading">Começar novamente</h3>
    <p>Remova os participantes e libere todos os números. As configurações salvas da rifa serão mantidas.</p>
    <button ref={trigger} className="secondary-button raffle-reset-button" type="button" disabled={disabled || busy} onClick={open}>RESETAR RIFA</button>
    {success && <p className="inline-notice settings-success" role="status">Rifa resetada. Todos os números estão disponíveis e as reservas foram reabertas.</p>}
    <dialog ref={dialog} className="raffle-reset-dialog" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description"
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <h3 id="reset-dialog-title">Resetar esta rifa?</h3>
      <p id="reset-dialog-description">Todos os participantes, reservas, registros de pagamento e histórico serão apagados, inclusive reservas pagas. O resultado de um sorteio anterior também será removido, e as reservas serão reabertas.</p>
      <p>Preço, quantidade de números, prêmios, data, tema, Pix e senha serão mantidos. Essa ação não pode ser desfeita e não realiza reembolsos.</p>
      <label className="field-label">Digite RESETAR para confirmar
        <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy}/>
      </label>
      {error && <p className="inline-notice" role="alert">{error}</p>}
      <div className="raffle-reset-dialog-actions">
        <button className="secondary-button" type="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>CANCELAR</button>
        <button className="primary-button" type="button" disabled={busy || confirmation !== 'RESETAR'} onClick={reset}>{busy ? 'RESETANDO...' : 'RESETAR RIFA'}</button>
      </div>
    </dialog>
  </section>;
}
