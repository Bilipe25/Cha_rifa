export function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try { return new URL(configured); }
    catch { throw new Error('NEXT_PUBLIC_APP_URL deve ser uma URL válida'); }
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`);
  return new URL('http://localhost:3000');
}

export function publicRafflePath(slug: string) {
  return `/${encodeURIComponent(slug)}`;
}
