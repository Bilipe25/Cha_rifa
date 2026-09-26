'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function MyNumbersEntry({ slug }: { slug: string }) {
  const [hasReservation, setHasReservation] = useState(false);
  useEffect(() => { setHasReservation(localStorage.getItem(`charifa:${slug}:has-reservation`) === '1'); }, [slug]);
  return hasReservation ? <Link className="home-my-numbers" href={`/${slug}/meus-numeros`}>Ver meus números</Link> : null;
}
