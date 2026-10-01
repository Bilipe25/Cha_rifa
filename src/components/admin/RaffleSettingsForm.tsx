'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icons';
import { formatMoney } from '@/lib/currency';
import { normalizePixMerchantText } from '@/lib/pix-format';
import { normalizePixKey } from '@/lib/pix-key';
import { ResetRaffleButton } from '@/components/admin/ResetRaffleButton';

type Settings = {
  drawDate: string;
  prizeOneCents: number;
  prizeTwoCents: number;
  pricePerNumberCents: number;
  totalNumbers: number;
  pixKey: string;
  pixReceiverName: string;
  pixReceiverCity: string;
};

function parseBrl(value: string) {
  const clean = value.replace(/\s|R\$/gi, '');
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split(',');
  const cents = Number(whole.replaceAll('.', '')) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function RaffleSettingsForm({ slug, initial, hasReservations, drawn }: {
  slug: string; initial: Settings; hasReservations: boolean; drawn: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [date, setDate] = useState(initial.drawDate);
  const [prizeOne, setPrizeOne] = useState(formatMoney(initial.prizeOneCents));
  const [prizeTwo, setPrizeTwo] = useState(formatMoney(initial.prizeTwoCents));
  const [price, setPrice] = useState(formatMoney(initial.pricePerNumberCents));
  const [quantity, setQuantity] = useState(String(initial.totalNumbers));
  const [pixKey, setPixKey] = useState(initial.pixKey);
  const [pixReceiverName, setPixReceiverName] = useState(initial.pixReceiverName);
  const [pixReceiverCity, setPixReceiverCity] = useState(initial.pixReceiverCity);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const saveButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draft) return;
    const originalButton = saveButton.current;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setDraft(null); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const buttons = [...dialog.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); originalButton?.focus(); };
  }, [draft, busy]);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSuccess('');
    const values = {
      drawDate: date,
      prizeOneCents: parseBrl(prizeOne),
      prizeTwoCents: parseBrl(prizeTwo),
      pricePerNumberCents: parseBrl(price),
      totalNumbers: Number(quantity),
      pixKey: normalizePixKey(pixKey),
      pixReceiverName: pixReceiverName.trim(),
      pixReceiverCity: pixReceiverCity.trim(),
    };
    if (values.prizeOneCents === null || values.prizeTwoCents === null || values.pricePerNumberCents === null ||
      values.pricePerNumberCents < 1 || !Number.isInteger(values.totalNumbers) || values.totalNumbers < 2 || values.totalNumbers > 1000) {
      setError('Confira os valores e escolha uma quantidade entre 2 e 1000 números.');
      return;
    }
    if (!values.pixKey) { setError('Confira a chave Pix. Use CPF/CNPJ, e-mail, celular ou chave aleatória em formato válido.'); return; }
    const normalizedReceiver = normalizePixMerchantText(values.pixReceiverName);
    const normalizedCity = normalizePixMerchantText(values.pixReceiverCity);
    if (!normalizedReceiver || normalizedReceiver.length > 25) { setError('O nome do recebedor deve ter até 25 caracteres aceitos pelo Pix.'); return; }
    const pixChanged = values.pixKey !== saved.pixKey || values.pixReceiverName !== saved.pixReceiverName ||
      values.pixReceiverCity !== saved.pixReceiverCity;
    if (!normalizedCity || (pixChanged && normalizedCity.length > 15)) {
      setError('A cidade do recebedor deve ter até 15 caracteres aceitos pelo Pix.'); return;
    }
    const next = values as Settings;
    if (hasReservations && (next.pricePerNumberCents !== saved.pricePerNumberCents || next.totalNumbers !== saved.totalNumbers)) {
      setDraft(next);
    } else void save(next);
  }

  async function save(next: Settings) {
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`/api/admin/${encodeURIComponent(slug)}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      });
      const body = await response.json();
      if (response.status === 401) { router.replace(`/admin/${slug}/login`); return; }
      if (!response.ok) {
        setDraft(null);
        setError(body.error || 'Não foi possível salvar. Confira os dados e tente novamente.');
        return;
      }
      setSaved(next);
      setDraft(null);
      setSuccess('Configurações atualizadas com sucesso! 💕');
      router.refresh();
    } catch {
      setDraft(null);
      setError('Não foi possível salvar agora. Confira sua conexão e tente novamente.');
    } finally { setBusy(false); }
  }

  return <div className="settings-panel panel-flow">
    <Link className="back-link" href={`/admin/${slug}`}><Icon name="back" size={18}/> Voltar ao painel</Link>
    <div className="panel-heading"><h2>Configurações da Rifa</h2><p>Você pode ajustar as principais informações do Chá-Rifa por aqui. 💕</p></div>
    {drawn && <p className="inline-notice">O sorteio já foi realizado. As informações desta rifa estão preservadas.</p>}
    <form className="settings-form" onSubmit={prepare}>
      <label className="field-label">Data do sorteio
        <input type="date" value={date} onChange={event => setDate(event.target.value)} required disabled={drawn || busy}/>
      </label>
      <div className="settings-prizes">
        <label className="field-label">1º prêmio
          <input type="text" inputMode="decimal" value={prizeOne} onChange={event => setPrizeOne(event.target.value)} required disabled={drawn || busy}/>
        </label>
        <label className="field-label">2º prêmio
          <input type="text" inputMode="decimal" value={prizeTwo} onChange={event => setPrizeTwo(event.target.value)} required disabled={drawn || busy}/>
        </label>
      </div>
      <label className="field-label">Valor de cada número
        <input type="text" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} required disabled={drawn || busy}/>
      </label>
      {hasReservations && <p className="settings-help">O novo valor será aplicado somente às próximas reservas.</p>}
      <label className="field-label">Quantidade de números
        <input type="number" min="2" max="1000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} required disabled={drawn || busy}/>
      </label>
      <p className="settings-help">Você pode ter de 2 a 1000 números. Números já reservados ou pagos ficam protegidos.</p>
      <label className="field-label">Chave Pix
        <input type="text" autoCapitalize="none" spellCheck={false} maxLength={77} value={pixKey} onChange={event => setPixKey(event.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" required disabled={drawn || busy}/>
      </label>
      <label className="field-label">Nome do recebedor
        <input type="text" maxLength={25} value={pixReceiverName} onChange={event => setPixReceiverName(event.target.value)} required disabled={drawn || busy}/>
      </label>
      <label className="field-label">Cidade do recebedor
        <input type="text" maxLength={15} value={pixReceiverCity} onChange={event => setPixReceiverCity(event.target.value)} required disabled={drawn || busy}/>
      </label>
      {saved.pixReceiverCity.length > 15 && <p className="settings-help">A cidade atual é um exemplo antigo. Você pode salvar outras informações; ao trocar qualquer dado Pix, informe uma cidade de até 15 caracteres.</p>}
      <p className="settings-help">Os dados Pix atualizados valem para novas reservas. Códigos Pix já gerados continuam iguais. Nome e cidade são ajustados ao formato do Pix.</p>
      {error && <p className="inline-notice" role="alert">{error}</p>}
      {success && <p className="inline-notice settings-success" role="status">{success}</p>}
      {!drawn && <button ref={saveButton} type="submit" className="primary-button" disabled={busy}><span>{busy ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}</span></button>}
    </form>
    <ResetRaffleButton slug={slug} disabled={busy || draft !== null}/>
    {draft && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title">
      <h3 id="settings-confirm-title">Confirmar alterações?</h3>
      <p>Já existem participantes nessa rifa. As reservas atuais não serão alteradas. Deseja continuar?</p>
      <div><button className="secondary-button" type="button" disabled={busy} onClick={() => setDraft(null)}>CANCELAR</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save(draft)}>{busy ? 'SALVANDO...' : 'SIM, SALVAR'}</button></div>
    </div></div>}
  </div>;
}
