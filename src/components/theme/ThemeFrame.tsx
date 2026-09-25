import Image from 'next/image';
import { getTheme } from '@/config/themes';

export function ThemeFrame({ themeKey, kind, children, className = '' }: {
  themeKey: string; kind: 'home' | 'guest' | 'admin'; children: React.ReactNode; className?: string;
}) {
  const theme = getTheme(themeKey);
  if (!theme) return null;
  const src = kind === 'home' ? theme.homeFrame : kind === 'guest' ? theme.guestFrame : theme.adminFrame;
  return <div className={`theme-frame theme-frame--${kind} ${className}`}>
    <Image src={src} fill alt="" sizes="(max-width: 480px) 100vw, 480px" priority className="frame-art" />
    <main className={`frame-content frame-content--${kind}`}>{children}</main>
  </div>;
}
