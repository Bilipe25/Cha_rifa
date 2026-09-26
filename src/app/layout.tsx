import type { Metadata } from 'next';
import { appBaseUrl } from '@/lib/app-url';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: appBaseUrl(),
  title: 'Chá-Rifa Digital',
  description: 'Escolha seus números e participe do Chá-Rifa.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
