import { redirect } from 'next/navigation';

export default function RootPage() {
  const slug = process.env.DEFAULT_RAFFLE_SLUG || process.env.RAFFLE_SLUG || 'maria-antonella';
  if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) redirect(`/${slug}`);
  return <main><h1>Chá-Rifa Digital</h1><p>Use o link da rifa para participar.</p></main>;
}
