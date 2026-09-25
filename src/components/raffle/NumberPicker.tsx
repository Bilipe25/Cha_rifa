'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icons';
import { formatMoney, formatNumber } from '@/lib/currency';

const storageKey = (slug: string) => `charifa:${slug}:selection`;

export function NumberPicker({ slug, totalNumbers, priceCents, initialOccupied }: {
  slug: string; totalNumbers: number; priceCents: number; initialOccupied: number[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [occupied, setOccupied] = useState(initialOccupied);
  const [selected, setSelected] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState(search.has('atualizar') ? 'Alguns números acabaram de ser escolhidos por outra pessoa. Atualizamos a lista para você.' : '');
  const occupiedSet = useMemo(() => new Set(occupied), [occupied]);
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey(slug)) ?? '[]') as number[];
      setSelected(stored.filter(number => Number.isInteger(number) && number >= 1 && number <= totalNumbers && !occupiedSet.has(number)));
    } catch { sessionStorage.removeItem(storageKey(slug)); }
    setLoaded(true);
  }, [slug, totalNumbers, occupiedSet]);
  useEffect(() => { if (loaded) sessionStorage.setItem(storageKey(slug), JSON.stringify(selected)); }, [slug, selected, loaded]);
  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch(`/api/${slug}/numbers`, { cache: 'no-store' });
        if (response.ok) setOccupied((await response.json()).occupied);
      } catch { /* A reserva ainda é validada no servidor. */ }
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [slug]);
  function toggle(number: number) {
    if (occupiedSet.has(number)) return;
    setNotice('');
    setSelected(current => current.includes(number) ? current.filter(value => value !== number) : [...current, number].sort((a, b) => a - b));
  }
  function continueToReserve() {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(selected));
    router.push(`/${slug}/reservar`);
  }
  return <div className="picker panel-layout">
    <div className="panel-heading"><h2>Escolha seus números</h2><p>Selecione os números disponíveis para participar</p></div>
    <div className="legend" aria-label="Legenda dos números"><span><i className="legend-swatch"/>Disponível</span><span><i className="legend-swatch occupied"/>Ocupado</span><span><i className="legend-swatch selected"/>Selecionado</span></div>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    <div className="number-scroll" aria-label={`Números de 1 a ${totalNumbers}`}><div className="number-grid">
      {Array.from({ length: totalNumbers }, (_, index) => index + 1).map(number => {
        const unavailable = occupiedSet.has(number);
        const chosen = selected.includes(number);
        return <button key={number} type="button" className={`number-button ${unavailable ? 'number-button--occupied' : ''} ${chosen ? 'number-button--selected' : ''}`}
          disabled={unavailable} aria-pressed={chosen} aria-label={`Número ${number}${unavailable ? ', ocupado' : chosen ? ', selecionado' : ', disponível'}`}
          onClick={() => toggle(number)}>{formatNumber(number)}</button>;
      })}
    </div></div>
    <div className="selection-summary"><div><span>Números escolhidos</span><strong>{selected.length ? selected.map(formatNumber).join(' · ') : 'Nenhum ainda'}</strong></div><div className="summary-total"><span>Total</span><strong>{formatMoney(selected.length * priceCents)}</strong></div></div>
    <button className="primary-button" type="button" disabled={!selected.length} onClick={continueToReserve}><Icon name="ticket"/><span>RESERVAR AGORA</span><Icon name="arrow"/></button>
  </div>;
}
