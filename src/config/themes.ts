export const themes = {
  'maria-antonella': {
    homeFrame: '/themes/maria-antonella/home-frame.webp',
    guestFrame: '/themes/maria-antonella/guest-frame.webp',
    adminFrame: '/themes/maria-antonella/admin-frame.webp',
  },
} as const;

export function getTheme(key: string) {
  return themes[key as keyof typeof themes];
}
