# Chá-Rifa Digital

Aplicação Next.js para uma rifa mobile com reserva atômica de números, Pix Copia e Cola, painel protegido e sorteio de dois prêmios. A primeira rifa usa as três molduras da Maria Antonella. As regras e páginas são compartilhadas por outras rifas cadastradas.

## Instalação local

Requisitos: Node.js 20.12+ e npm. Em `C:\projetos\Charifa`:

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha as variáveis. Para desenvolvimento local, `TURSO_DATABASE_URL=file:local.db`. Gere `SESSION_SECRET` com pelo menos 32 caracteres aleatórios. Defina uma `SEED_ADMIN_PASSWORD` com pelo menos 12 caracteres. Mantenha `.env.local` fora do Git.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000/maria-antonella`. O painel fica em `http://localhost:3000/admin/maria-antonella/login`.

## Turso e migrações

Crie um banco Turso/libSQL e configure `TURSO_DATABASE_URL=libsql://...` e `TURSO_AUTH_TOKEN` no ambiente local e na Vercel. Depois execute `npm run db:migrate` e `npm run db:seed` apontando para esse banco. O seed cria a rifa e seus 200 números somente se ela ainda não existir, preservando reservas de uma instalação existente.

Quando mudar o schema, rode `npm run db:generate`, revise a migração em `drizzle/` e execute `npm run db:migrate` antes de publicar a nova versão.

## Pix e senha da mãe

Configure `SEED_PIX_KEY`, `SEED_PIX_RECEIVER_NAME` e `SEED_PIX_RECEIVER_CITY` com os dados reais da recebedora antes do primeiro seed. Sem as três informações, a página de reserva informa que o pagamento ainda não está disponível e não bloqueia números. O app não confirma Pix automaticamente: a participante avisa que pagou e a mãe confirma no painel.

Para atualizar Pix ou trocar a senha após o seed, ajuste as variáveis no ambiente e execute `npm run db:configure`. Essa ação atualiza a rifa definida por `RAFFLE_SLUG` (padrão: `maria-antonella`). A senha é armazenada como hash com sal. Remova as variáveis de seed do ambiente de produção depois da configuração; o aplicativo em execução lê Pix e hash do banco.

## Nova rifa ou tema

Coloque `home-frame.webp`, `guest-frame.webp` e `admin-frame.webp` em `public/themes/<tema>/` e registre os caminhos em `src/config/themes.ts`. As molduras devem manter áreas livres para conteúdo nas mesmas regiões das atuais; caso mudem de proporção ou composição, ajuste o posicionamento em `src/app/globals.css`.

Cadastre a nova rifa na tabela `raffles` com um `slug` único e `theme_key` correspondente e gere seus registros em `raffle_numbers` de 1 até `total_numbers`. Informe preço e prêmios em centavos, data no formato `AAAA-MM-DD`, dados Pix e hash de senha. As mesmas rotas `/<slug>` e `/admin/<slug>` funcionarão para essa rifa.

## Vercel

Importe este projeto na Vercel como projeto Next.js. Configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `SESSION_SECRET` nas variáveis de ambiente da Vercel. Execute migração e seed no banco Turso antes de liberar a URL. `npm run build` é o comando de compilação. As artes ficam em `public/themes/` e são publicadas junto com o aplicativo.

## Comportamento importante

- Uma transação de escrita confere cada número e desfaz a reserva inteira se algum já estiver ocupado.
- Somente pagamentos confirmados contam no valor arrecadado e participam do sorteio.
- Cada número pago vale uma chance; o sorteio usa aleatoriedade criptográfica do servidor e grava os dois vencedores.
- O QR Code e o código Copia e Cola são gerados a partir do mesmo payload Pix com valor calculado no servidor.
