'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallContextValue = {
  promptEvent: InstallEvent | null;
  setPromptEvent: (event: InstallEvent | null) => void;
  installed: boolean;
  setInstalled: (installed: boolean) => void;
};

const InstallContext = createContext<InstallContextValue | null>(null);

export function AdminInstallProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallEvent);
    }
    function onInstalled() { setInstalled(true); setPromptEvent(null); }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return <InstallContext.Provider value={{ promptEvent, setPromptEvent, installed, setInstalled }}>
    {children}
  </InstallContext.Provider>;
}

export function useAdminInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error('AdminInstallProvider ausente');
  return context;
}
