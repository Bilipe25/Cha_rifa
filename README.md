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

Antes de publicar uma atualização, execute `npm run typecheck`, `npm run build` e `npm run test:integration`. O teste cria um banco descartável com Pix e senha sintéticos, inicia a aplicação em uma porta local e não acessa o Turso configurado em `.env.local`.

Abra `http://localhost:3000/maria-antonella`. O painel fica em `http://localhost:3000/admin/maria-antonella/login`.

## Turso e migrações

Crie um banco Turso/libSQL e configure `TURSO_DATABASE_URL=libsql://...` e `TURSO_AUTH_TOKEN` no ambiente local e na Vercel. Depois execute `npm run db:migrate` e `npm run db:seed` apontando para esse banco. O seed cria a rifa e seus 200 números somente se ela ainda não existir, preservando reservas de uma instalação existente.

Quando mudar o schema, rode `npm run db:generate`, revise a migração em `drizzle/` e execute `npm run db:migrate` antes de publicar a nova versão.

## Pix e senha da mãe

Configure `SEED_PIX_KEY`, `SEED_PIX_RECEIVER_NAME` e `SEED_PIX_RECEIVER_CITY` com os dados reais da recebedora antes do primeiro seed. Sem as três informações, a página de reserva informa que o pagamento ainda não está disponível e não bloqueia números. O app não confirma Pix automaticamente: a participante avisa que pagou e a mãe confirma no painel.

Para atualizar Pix ou trocar a senha após o seed, ajuste as variáveis no ambiente e execute `npm run db:configure`. Essa ação atualiza a rifa definida por `RAFFLE_SLUG` (padrão: `maria-antonella`). A senha é armazenada como hash com sal. Remova as variáveis de seed do ambiente de produção depois da configuração; o aplicativo em execução lê Pix e hash do banco.

Trocar a senha com `db:configure` incrementa a versão da sessão e encerra os acessos administrativos anteriores. O login tem limite de tentativas por IP e por rifa.

## Reservas, pagamentos e sorteio

- Cada reserva aceita até 10 números. Uma reserva que continua **sem aviso de pagamento** vence após 24 horas. A consulta de disponibilidade libera automaticamente esses números e registra a alteração no histórico.
- Ao tocar em “Já fiz o pagamento”, a reserva fica aguardando conferência manual, sem expiração automática, para não liberar números de alguém que pagou. A mãe precisa confirmar o pagamento ou liberar a reserva no painel.
- Se a pessoa informar que pagou depois de a reserva vencer, os números permanecem liberados. O painel mostra o caso em “Após o prazo”, permite conversar pelo WhatsApp e registrar a solução combinada, como reembolso ou novos números. Um Pix Copia e Cola já copiado não pode ser cancelado pelo aplicativo.
- O painel permite encerrar e reabrir reservas antes do sorteio. Para sortear, a rifa precisa estar encerrada, a data anunciada precisa ter chegado, todas as reservas pendentes precisam estar resolvidas e pelo menos dois números pagos precisam existir. Depois do sorteio, reservas e mudanças de pagamento ficam bloqueadas.
- A home mostra “Ver meus números” no navegador em que uma reserva foi concluída. A consulta por telefone exibe apenas números e situação das reservas, sem nomes, valores ou links de Pix. Telefone sozinho não comprova identidade; se a rifa exigir privacidade maior, adicione verificação por código antes de disponibilizar essa consulta em outra campanha.
- O resultado público fica em `/<slug>/resultado` e mostra apenas números vencedores, data e regras, sem telefone.

## Publicar esta atualização

Faça backup do banco Turso, aplique `npm run db:migrate` no banco remoto e só então publique a versão nova. As migrações `0001` e `0002` adicionam colunas e tabelas sem apagar reservas existentes. Reservas antigas sem `expires_at` continuam válidas e devem ser revisadas manualmente no painel. As sessões antigas do painel precisarão fazer login novamente. Confira na Vercel se a branch de produção acompanha `master`.

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
