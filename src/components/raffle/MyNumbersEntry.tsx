import Link from 'next/link';

export function MyNumbersEntry({ slug }: { slug: string }) {
  return <Link className="home-my-numbers" href={`/${slug}/meus-numeros`}>Ver meus números</Link>;
}
