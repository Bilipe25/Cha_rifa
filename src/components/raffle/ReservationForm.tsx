'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';
import { normalizePhone, validPhone } from '@/lib/phone';
import { MAX_NUMBERS_PER_RESERVATION } from '@/config/limits';

function maskPhone(value: string) {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  const split = digits.length > 10 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

export function ReservationForm({ slug, priceCents, totalNumbers }: { slug: string; priceCents: number; totalNumbers: number }) {
  const router = useRouter();
  const search = useSearchParams();
  const fallbackNumbers = search.get('numeros');
  const [numbers, setNumbers] = useState<number[]>([]);
  const [currentPriceCents, setCurrentPriceCents] = useState(priceCents);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCurrentPriceCents(priceCents);
  }, [priceCents]);
  useEffect(() => {
    try {
      const fallback = fallbackNumbers?.split(',').map(Number) ?? [];
      const stored = JSON.parse(sessionStorage.getItem(`charifa:${slug}:selection`) ?? JSON.stringify(fallback)) as number[];
      setNumbers([...new Set(stored.filter(n => Number.isInteger(n) && n >= 1 && n <= totalNumbers))].sort((a, b) => a - b).slice(0, MAX_NUMBERS_PER_RESERVATION));
    } catch {
      setNumbers((fallbackNumbers?.split(',').map(Number) ?? []).filter(n => Number.isInteger(n) && n >= 1 && n <= totalNumbers).slice(0, MAX_NUMBERS_PER_RESERVATION));
    }
  }, [slug, totalNumbers, fallbackNumbers]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!numbers.length) { setError('Escolha pelo menos um número para continuar.'); return; }
    if (name.trim().length < 2) { setError('Digite seu nome completo.'); return; }
    if (!validPhone(phone)) { setError('Confira o número do WhatsApp.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/${slug}/reserve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numbers, name, phone, expectedPriceCents: currentPriceCents }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === 'unavailable') { router.push(`/${slug}/numeros?atualizar=1`); return; }
        if (result.code === 'price_changed') setCurrentPriceCents(result.priceCents);
        setError(result.error || 'Não conseguimos concluir agora. Tente novamente em alguns instantes.'); return;
      }
      try {
        sessionStorage.removeItem(`charifa:${slug}:selection`);
        const key = `charifa:${slug}:receipts`;
        const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
        const receipts = Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
        localStorage.setItem(key, JSON.stringify([result.reservationId, ...receipts.filter(id => id !== result.reservationId)].slice(0, 20)));
      } catch { /* A reserva foi concluída mesmo sem armazenamento local. */ }
      router.push(`/${slug}/pix/${result.reservationId}`);
    } catch { setError('Não conseguimos concluir agora. Tente novamente em alguns instantes.'); }
    finally { setBusy(false); }
  }
  return <form className="reservation-form panel-flow" onSubmit={submit} noValidate>
    <Link className="back-link" href={`/${slug}/numeros`}><Icon name="back" size={18}/> Voltar aos números</Link>
    <div className="panel-heading"><h2>Reservar números</h2><p>Preencha seus dados para continuar</p></div>
    <div className="reservation-recap"><span>Números selecionados</span><strong>{numbers.length ? numbers.map(formatNumber).join(' · ') : 'Nenhum número selecionado'}</strong><div>Total <b>{formatMoney(numbers.length * currentPriceCents)}</b></div></div>
    <label className="field-label">Nome completo<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome e sobrenome" maxLength={100} required/></label>
    <label className="field-label">Telefone / WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(maskPhone(event.target.value))} placeholder="(79) 99999-9999" required/></label>
    <div className="pix-info"><Icon name="heart" size={22}/><div><strong>Pagamento via Pix</strong><p>Após preencher seus dados, você poderá gerar o código Pix para realizar o pagamento.</p></div></div>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <button className="primary-button" type="submit" disabled={busy || !numbers.length}><Icon name="lock" size={21}/><span>{busy ? 'GERANDO PIX...' : 'GERAR PIX'}</span><Icon name="arrow"/></button>
  </form>;
}
