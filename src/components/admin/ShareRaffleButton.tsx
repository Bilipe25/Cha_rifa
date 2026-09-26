'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icons';
import { buildPublicShareUrl, buildShareText } from '@/lib/share/raffle-share';

export function ShareRaffleButton({ slug, title }: { slug: string; title: string }) {
  const [notice, setNotice] = useState('');

  async function share() {
    const url = buildPublicShareUrl(window.location.origin, slug);
    const data = { title, text: buildShareText({ title }), url };
    if (navigator.share) {
      try {
        await navigator.share(data);
        setNotice('');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link da rifa copiado! 💕');
    } catch {
      setNotice('Não foi possível copiar. Abra a página da rifa e compartilhe o endereço.');
    }
  }

  return <>
    <button type="button" className="admin-action admin-share-action" onClick={share}>
      <span><Icon name="share" size={20}/> Compartilhar rifa</span><Icon name="arrow"/>
    </button>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
  </>;
}
