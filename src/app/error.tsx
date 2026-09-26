'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page" role="alert">
    <h1>Não foi possível abrir esta página</h1>
    <p>Confira sua conexão e tente novamente.</p>
    <button className="primary-button" type="button" onClick={reset}>TENTAR NOVAMENTE</button>
    <Link className="secondary-button" href="/">VOLTAR AO INÍCIO</Link>
  </main>;
}
