'use client';

import { useEffect, useState } from 'react';
import { useAdminInstall } from '@/components/pwa/AdminInstallProvider';

const dismissDays = 3;

export function InstallAdminApp({ slug, babyName }: { slug: string; babyName: string }) {
  const { promptEvent, setPromptEvent, installed, setInstalled } = useAdminInstall();
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [installError, setInstallError] = useState('');

  useEffect(() => {
    const key = `charifa_install_dismissed_${slug}`;
    let dismissedUntil = 0;
    try { dismissedUntil = Number(localStorage.getItem(key) || 0); }
    catch { /* Private browsing may block storage. */ }
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone || installed || dismissedUntil > Date.now()) return;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
    setIsIos(ios);
    setVisible(ios || Boolean(promptEvent));
  }, [slug, promptEvent, installed]);

  function dismiss() {
    try {
      localStorage.setItem(`charifa_install_dismissed_${slug}`, String(Date.now() + dismissDays * 24 * 60 * 60 * 1000));
    } catch { /* The card can still be dismissed for this page visit. */ }
    setVisible(false);
  }

  async function install() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setVisible(false);
      } else dismiss();
      setPromptEvent(null);
    } catch {
      setInstallError('Não foi possível instalar agora. Tente novamente mais tarde.');
    }
  }

  if (installed) return <p className="inline-notice" role="status">Prontinho! O painel foi adicionado ao seu celular. 💕</p>;
  if (!visible) return null;
  return <aside className="install-card" aria-label="Instalar painel">
    <h2>Tenha seu painel sempre à mão 💕</h2>
    <p>Você pode adicionar o Chá-Rifa da {babyName} à tela inicial do celular e abrir como um aplicativo.</p>
    {isIos && !promptEvent
      ? <p className="install-steps">No iPhone: toque em <strong>Compartilhar</strong>, escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</p>
      : <button type="button" className="secondary-button" onClick={install}>INSTALAR PAINEL</button>}
    {installError && <p className="inline-notice" role="alert">{installError}</p>}
    <button type="button" className="install-dismiss" onClick={dismiss}>Agora não</button>
  </aside>;
}
