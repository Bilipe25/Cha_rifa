'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminInstall } from '@/components/pwa/AdminInstallProvider';

const dismissDays = 3;

export function InstallAdminApp({ slug, babyName }: { slug: string; babyName: string }) {
  const { promptEvent, setPromptEvent, installed, setInstalled } = useAdminInstall();
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [installError, setInstallError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (visible && dialog && !dialog.open) {
      // Installation can wait for another visit while the mother is handling a reservation.
      if (document.querySelector('dialog:modal')) { setVisible(false); return; }
      dialog.showModal();
    }
  }, [visible]);

  function dismiss() {
    try {
      localStorage.setItem(`charifa_install_dismissed_${slug}`, String(Date.now() + dismissDays * 24 * 60 * 60 * 1000));
    } catch { /* The dialog can still be dismissed for this page visit. */ }
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

  if (installed || !visible) return null;
  return <dialog ref={dialogRef} className="install-dialog" aria-labelledby="install-title" aria-describedby="install-description" onClose={dismiss}>
    <h2 id="install-title">Tenha seu painel sempre à mão</h2>
    <p id="install-description">Você pode adicionar o Chá-Rifa da {babyName} à tela inicial do celular e abrir como um aplicativo.</p>
    {isIos && !promptEvent
      ? <p className="install-steps">No iPhone: toque em <strong>Compartilhar</strong>, escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</p>
      : <button type="button" className="primary-button" onClick={install}>INSTALAR PAINEL</button>}
    {installError && <p className="inline-notice" role="alert">{installError}</p>}
    <button type="button" className="install-dismiss" onClick={() => dialogRef.current?.close()}>Agora não</button>
  </dialog>;
}
