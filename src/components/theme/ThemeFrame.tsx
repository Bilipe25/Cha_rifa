import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import type { FrameVariant, RaffleTheme } from '@/config/themes';

type FrameStyle = CSSProperties & {
  '--frame-top': string;
  '--frame-left': string;
  '--frame-right': string;
  '--frame-bottom': string;
  '--frame-compact-left'?: string;
  '--frame-compact-right'?: string;
};

export function ThemeFrame({ theme, variant, children, className = '' }: {
  theme: RaffleTheme; variant: FrameVariant; children: ReactNode; className?: string;
}) {
  const layout = theme.layout[variant];
  const style: FrameStyle = {
    '--frame-top': layout.top,
    '--frame-left': layout.left,
    '--frame-right': layout.right,
    '--frame-bottom': layout.bottom,
    '--frame-compact-left': theme.compactLayout?.[variant]?.left,
    '--frame-compact-right': theme.compactLayout?.[variant]?.right,
  };
  return <div className={`theme-frame theme-frame--${variant} ${className}`} style={style}>
    <Image src={theme.frames[variant]} fill alt="" sizes="(max-width: 480px) 100vw, 480px" priority className="frame-art" />
    <main className={`frame-content frame-content--${variant}`}>{children}</main>
  </div>;
}
