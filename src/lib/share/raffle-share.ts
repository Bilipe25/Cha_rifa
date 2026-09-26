import { publicRafflePath } from '@/lib/app-url';

export function buildShareText(raffle: { title: string }) {
  const title = raffle.title.replace(/^Chá Rifa\b/i, 'Chá-Rifa');
  return `💕 O ${title} já está disponível!\n\nEscolha seus números favoritos e participe com a gente. 🌸`;
}

export function buildPublicShareUrl(baseUrl: string, slug: string) {
  return new URL(publicRafflePath(slug), baseUrl).toString();
}
