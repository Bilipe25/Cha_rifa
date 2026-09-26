export type FrameVariant = 'home' | 'guest' | 'admin';

export type FrameLayout = {
  top: string;
  left: string;
  right: string;
  bottom: string;
};

export type RaffleTheme = {
  frames: Record<FrameVariant, string>;
  shareImage: string;
  icons: { icon192: string; icon512: string; appleTouchIcon: string };
  layout: Record<FrameVariant, FrameLayout>;
  compactLayout?: Partial<Record<FrameVariant, Partial<FrameLayout>>>;
  themeColor: string;
  backgroundColor: string;
};

export const themes: Record<string, RaffleTheme> = {
  'maria-antonella': {
    frames: {
      home: '/themes/maria-antonella/home-frame.webp',
      guest: '/themes/maria-antonella/guest-frame.webp',
      admin: '/themes/maria-antonella/admin-frame.webp',
    },
    shareImage: '/themes/maria-antonella/share.jpg',
    icons: {
      icon192: '/themes/maria-antonella/icon-192.png',
      icon512: '/themes/maria-antonella/icon-512.png',
      appleTouchIcon: '/themes/maria-antonella/apple-touch-icon.png',
    },
    layout: {
      home: { top: '38%', left: '8%', right: '8%', bottom: '5%' },
      guest: { top: '24%', left: '6.1%', right: '6.1%', bottom: '15.2%' },
      admin: { top: '22.6%', left: '6.2%', right: '6.2%', bottom: '19%' },
    },
    compactLayout: { guest: { left: '6.6%', right: '6.6%' } },
    themeColor: '#e85c84',
    backgroundColor: '#fff9f7',
  },
};

export function getTheme(key: string): RaffleTheme | undefined {
  return themes[key];
}
