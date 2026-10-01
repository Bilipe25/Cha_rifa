'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';
import { participantDateTime, participantStatusLabels, type AdminParticipant } from '@/lib/admin-participant';

export function useParticipantSheet(slug: string, people: AdminParticipant[], drawn: boolean) {
  const id = useId();
  const [selected, setSelected] = useState<AdminParticipant | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  function open(person: AdminParticipant, element: HTMLElement) {
    trigger.current = element.matches('button') ? element : element.querySelector('button');
    setSelected(person);
  }
  function close() {
    setSelected(null);
    requestAnimationFrame(() => {
      const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>('.dashboard-preview, .participants-scroll');
      target?.focus({ preventScroll: true });
    });
  }
  return {
    open, dialogId: id,
    sheet: selected && <ParticipantSheet key={selected.id} id={id} slug={slug}
      initial={people.find(person => person.id === selected.id) ?? selected} drawn={drawn} onClose={close}/>,
  };
}

function ParticipantSheet({ id, slug, initial, drawn, onClose }: {
  id: string; slug: string; initial: AdminParticipant; drawn: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmationBox = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const actionLock = useRef(false);
  const readGeneration = useRef(0);
  const gesture = useRef<{ y: number; offset: number } | null>(null);
  const [person, setPerson] = useState(initial);
  const [isDrawn, setIsDrawn] = useState(drawn);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [confirmation, setConfirmation] = useState<'cancelled' | 'pending' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [note, setNote] = useState('');
  const path = `/api/admin/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(initial.id)}`;

  useEffect(() => { setPerson(initial); setIsDrawn(drawn); }, [initial, drawn]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const generation = ++readGeneration.current;
    const response = await fetch(path, { cache: 'no-store', signal });
    if (generation !== readGeneration.current) return false;
    if (response.status === 401) { router.replace(`/admin/${slug}/login`); throw new Error('Entre novamente para continuar.'); }
    if (response.status === 404) { setUnavailable(true); throw new Error('Esta reserva não está mais disponível.'); }
    const body = await response.json();
    if (generation !== readGeneration.current) return false;
    if (!response.ok) throw new Error(body.error || 'Não foi possível atualizar os detalhes.');
    setPerson(body.person); setIsDrawn(body.drawn); setUnavailable(false);
    return true;
  }, [path, router, slug]);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('.participant-sheet-close')?.focus({ preventScroll: true });
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || actionLock.current) return;
      try { if (await reload(controller.signal) && !actionLock.current) setError(''); }
      catch (cause) { if (!controller.signal.aborted && !actionLock.current) setError(cause instanceof Error ? cause.message : 'Confira sua conexão e tente novamente.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [reload]);
  useEffect(() => {
    if (confirmation) {
      confirmationBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      cancelButton.current?.focus({ preventScroll: true });
    }
  }, [confirmation]);

  function close() {
    if (actionLock.current || closing) return;
    const element = dialog.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { element.close(); return; }
    setClosing(true);
    void element.animate([{ transform: getComputedStyle(element).transform, opacity: 1 }, { transform: 'translateY(32px)', opacity: 0 }], {
      duration: 160, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards',
    }).finished.then(() => element.close()).catch(() => element.close());
  }
  async function save(status?: 'paid' | 'pending' | 'cancelled') {
    if (actionLock.current || unavailable || loading || isDrawn) return;
    if (!status && note.trim().length < 8) { setError('Descreva a solução com pelo menos 8 caracteres.'); return; }
    actionLock.current = true; readGeneration.current++; setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(status ? path : `/api/admin/${encodeURIComponent(slug)}/late-payment/${encodeURIComponent(person.id)}`, {
        method: status ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status ? { status } : { note: note.trim() }),
      });
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      const body = await response.json();
      if (!response.ok) {
        try { await reload(); } catch { /* Keep the mutation error visible. */ }
        throw new Error(body.error || 'Não foi possível salvar. Tente novamente.');
      }
      // Only reflect a change after the server has accepted it.
      if (status) setPerson(current => ({ ...current, status }));
      else setPerson(current => ({ ...current, latePaymentResolvedAt: new Date().toISOString() }));
      setConfirmation(null); setNote('');
      setSuccess(status === 'cancelled' ? 'Números liberados. A reserva permanece no histórico.'
        : status === 'paid' ? 'Pagamento confirmado.' : status === 'pending' ? 'Reserva marcada como pendente.' : 'Solução registrada.');
      router.refresh();
      try { await reload(); }
      catch { setError('Alteração salva. Não foi possível atualizar os detalhes agora. Use Atualizar dados.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira sua conexão e tente novamente.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const editable = !isDrawn && !unavailable && person.status !== 'cancelled';
  return <dialog ref={dialog} id={id} className="participant-sheet" aria-modal="true" aria-labelledby={`${id}-title`}
    onKeyDown={event => {
      if (event.key !== 'Tab' || !dialog.current) return;
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), summary')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); close(); }} onClose={onClose}>
    <div className="participant-sheet-handle" aria-hidden="true"
      onPointerDown={event => {
        if (busy || closing || event.button !== 0) return;
        gesture.current = { y: event.clientY, offset: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!gesture.current || !dialog.current) return;
        gesture.current.offset = Math.max(0, event.clientY - gesture.current.y);
        dialog.current.style.transform = `translateY(${gesture.current.offset}px)`;
      }}
      onPointerUp={() => {
        if ((gesture.current?.offset ?? 0) > 64) close();
        else if (dialog.current) dialog.current.style.transform = '';
        gesture.current = null;
      }}
      onPointerCancel={() => { gesture.current = null; if (dialog.current) dialog.current.style.transform = ''; }}><span/></div>
    <header className="participant-sheet-header">
      <div><h2 id={`${id}-title`}>{person.name}</h2><p>{person.phone}</p></div>
      <button className="participant-sheet-close" type="button" autoFocus aria-label="Fechar detalhes" disabled={busy || closing} onClick={close}><Icon name="close"/></button>
    </header>
    <div className="participant-sheet-body" aria-busy={busy || loading}>
      <div className="participant-sheet-summary">
        <span className={`participant-payment-status participant-payment-status--${person.status}`}><Icon name={person.status === 'paid' ? 'check' : person.status === 'cancelled' ? 'back' : 'clock'} size={18}/>{participantStatusLabels[person.status]}</span>
        <strong>{formatMoney(person.totalCents)}</strong>
      </div>
      <h3>Números da reserva</h3>
      <div className="participant-sheet-numbers">{person.numbers.map(number => <b key={number}>{formatNumber(number)}</b>)}</div>
      <p className="participant-sheet-date">Reservou em {participantDateTime(person.createdAt)}</p>
      {person.status === 'pending' && person.expiresAt && <p className="participant-sheet-date">Prazo até {participantDateTime(person.expiresAt)}</p>}
      {person.status === 'payment_reported' && <p className="inline-notice">A pessoa informou que pagou. Confira o Pix no banco antes de confirmar.</p>}
      {isDrawn && <p className="inline-notice">Sorteio concluído. Pagamentos e números estão preservados para consulta.</p>}
      {person.status === 'cancelled' && !unavailable && <p className="inline-notice">Esta reserva foi liberada. Os números podem estar disponíveis ou reservados por outra pessoa.</p>}
      {person.latePaymentReportedAt && <p className="admin-alert">Pagamento informado após o prazo em {participantDateTime(person.latePaymentReportedAt)}. {person.latePaymentResolvedAt ? 'Solução registrada.' : 'Confira com a pessoa antes de encerrar.'}</p>}
      {loading && <p className="participant-sheet-date" role="status">Conferindo dados da reserva…</p>}
      {success && <p className="inline-notice settings-success" role="status">{success}</p>}
      {error && <div className="participant-sheet-error"><p className="inline-notice" role="alert">{error}</p>
        {!unavailable && <button type="button" className="participant-sheet-text-action" disabled={busy || loading} onClick={async () => {
          setLoading(true); try { await reload(); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.'); } finally { setLoading(false); }
        }}>Atualizar dados</button>}</div>}
      {editable && !confirmation && <div className="participant-sheet-actions">
        {person.status !== 'paid' ? <button type="button" className="primary-button" data-sheet-action="paid" disabled={busy || loading} onClick={() => save('paid')}><Icon name="check" size={19}/><span>{busy ? 'SALVANDO…' : 'CONFIRMAR PAGAMENTO'}</span></button>
          : <button type="button" className="secondary-button" data-sheet-action="pending" disabled={busy || loading} onClick={() => { setConfirmation('pending'); setSuccess(''); }}>Marcar como pendente</button>}
        <button type="button" className="participant-sheet-release" data-sheet-action="release" disabled={busy || loading} onClick={() => { setConfirmation('cancelled'); setSuccess(''); }}>Liberar números desta reserva</button>
      </div>}
      {confirmation && editable && <div ref={confirmationBox} className="participant-sheet-confirm" role="group" aria-labelledby={`${id}-confirm`}>
        <h3 id={`${id}-confirm`}>{confirmation === 'cancelled' ? 'Liberar estes números?' : 'Voltar para pendente?'}</h3>
        <p><strong>{person.name}</strong> · {person.numbers.map(formatNumber).join(', ')}</p>
        <p>{confirmation === 'cancelled' ? person.status === 'paid'
          ? 'Este pagamento está confirmado. Os números poderão ser reservados por outra pessoa. Esta ação não realiza reembolso; confira a solução combinada antes de continuar.'
          : 'Todos os números desta reserva serão liberados para outras pessoas. O registro e o histórico serão mantidos.'
          : 'A confirmação de pagamento será removida e a reserva receberá um novo prazo para pagamento.'}</p>
        <div className="participant-sheet-confirm-actions">
          <button ref={cancelButton} type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
          <button type="button" className="primary-button" data-sheet-action="confirm" disabled={busy || loading} onClick={() => save(confirmation)}>{busy ? 'SALVANDO…' : confirmation === 'cancelled' ? 'LIBERAR NÚMEROS' : 'MARCAR PENDENTE'}</button>
        </div>
      </div>}
      <a className="participant-sheet-whatsapp" href={`https://wa.me/55${person.phoneNormalized}`} target="_blank" rel="noopener noreferrer">Conversar no WhatsApp <Icon name="arrow" size={17}/></a>
      {person.latePaymentReportedAt && !person.latePaymentResolvedAt && !unavailable && !isDrawn && <form className="participant-sheet-late" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="field-label">Como o pagamento foi resolvido?
          <textarea value={note} onChange={event => setNote(event.target.value)} required minLength={8} maxLength={300} rows={3} disabled={busy || loading} placeholder="Descreva o acordo: reembolso, novos números…"/>
        </label><button className="secondary-button" type="submit" disabled={busy || loading}>{busy ? 'Salvando…' : 'Registrar solução'}</button>
      </form>}
      <details className="participant-sheet-history"><summary>Ver histórico <span>{person.events.length}</span></summary>
        {person.events.length ? <ol>{person.events.map((event, index) => <li key={`${event.createdAt}-${index}`}>
          <strong>{event.fromStatus === event.toStatus ? 'Registro' : event.fromStatus === null ? 'Reserva criada' : participantStatusLabels[event.toStatus] || event.toStatus}</strong>
          <span>{participantDateTime(event.createdAt)} · {event.actor === 'admin' ? 'Painel da mãe' : event.actor === 'participant' ? 'Participante' : 'Sistema'}</span>
          {event.note && <p>{event.note}</p>}
        </li>)}</ol> : <p>Ainda não há alterações registradas.</p>}
      </details>
    </div>
  </dialog>;
}
