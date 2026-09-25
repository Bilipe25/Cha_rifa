import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chá-Rifa da Maria Antonella',
  description: 'Escolha seus números e participe do Chá-Rifa da Maria Antonella.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
