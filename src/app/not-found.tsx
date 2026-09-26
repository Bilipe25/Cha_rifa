import Link from 'next/link';

export default function NotFoundPage() {
  return <main className="error-page">
    <h1>Página não encontrada</h1>
    <p>Confira o endereço ou volte para a página inicial do Chá-Rifa.</p>
    <Link className="primary-button" href="/">VOLTAR AO INÍCIO</Link>
  </main>;
}
