# Chá-Rifa Digital

Aplicação Next.js para uma rifa mobile com reserva atômica de números, Pix Copia e Cola, painel protegido e sorteio de dois prêmios. A primeira rifa usa as três molduras da Maria Antonella. As regras e páginas são compartilhadas por outras rifas cadastradas.

## Instalação local

Requisitos: Node.js 20.12+ e npm. Em `C:\projetos\Charifa`:

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha as variáveis. Para desenvolvimento local, `TURSO_DATABASE_URL=file:local.db`. Gere `SESSION_SECRET` com pelo menos 32 caracteres aleatórios. Defina uma `SEED_ADMIN_PASSWORD` com pelo menos 4 caracteres. Mantenha `.env.local` fora do Git.

A senha mínima de 4 caracteres permite senhas curtas a pedido da responsável. Como o painel é público na internet, uma senha curta é fácil de adivinhar; prefira uma senha longa e exclusiva sempre que possível.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Antes de publicar uma atualização, execute `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build` e `npm run test:integration`. O teste de integração cria um banco descartável com Pix e senha sintéticos, inicia a aplicação em uma porta local e não acessa o Turso configurado em `.env.local`.

Abra `http://localhost:3000/maria-antonella`. O painel fica em `http://localhost:3000/admin/maria-antonella/login`.

## Turso e migrações

Crie um banco Turso/libSQL e configure `TURSO_DATABASE_URL=libsql://...` e `TURSO_AUTH_TOKEN` no ambiente local e na Vercel. Depois execute `npm run db:migrate` e `npm run db:seed` apontando para esse banco. O seed cria a rifa e seus 200 números somente se ela ainda não existir, preservando reservas de uma instalação existente.

Quando mudar o schema, rode `npm run db:generate`, revise a migração em `drizzle/` e execute `npm run db:migrate` antes de publicar a nova versão.

## Pix e senha da mãe

Configure `SEED_PIX_KEY`, `SEED_PIX_RECEIVER_NAME` e `SEED_PIX_RECEIVER_CITY` com os dados reais da recebedora antes do primeiro seed. Sem as três informações, a página de reserva informa que o pagamento ainda não está disponível e não bloqueia números. A chave aceita celular brasileiro, CPF, CNPJ, e-mail ou chave aleatória; o celular é gravado no formato `+55...`. O app valida o formato, mas não verifica se a chave está registrada no banco. Nome e cidade precisam ter até 25 e 15 caracteres, respectivamente. O app não confirma Pix automaticamente: a participante avisa que pagou e a mãe confirma no painel.

Para atualizar Pix após o seed, use **Configurações da rifa** no painel da mãe. A própria cliente deve preencher a chave, o nome e a cidade dela antes de receber pagamentos; os dados usados na instalação inicial são apenas exemplos. Para trocar a senha, ajuste a variável no ambiente e execute `npm run db:configure`. Essa ação atualiza a rifa definida por `RAFFLE_SLUG` (padrão: `maria-antonella`). A senha é armazenada como hash com sal. Remova as variáveis de seed do ambiente de produção depois da configuração; o aplicativo em execução lê Pix e hash do banco.

Trocar a senha com `db:configure` incrementa a versão da sessão e encerra os acessos administrativos anteriores daquela rifa. Cada rifa usa seu próprio cookie administrativo, permitindo abrir dois painéis no mesmo navegador. O login tem limite de tentativas por IP e por rifa.

## Reservas, pagamentos e sorteio

- Cada reserva aceita até 10 números, com limite de três reservas concluídas por telefone em 24 horas. Tentativas frustradas por conflito de números não gastam esse limite. Uma reserva que continua **sem aviso de pagamento** vence após 24 horas. A consulta de disponibilidade libera automaticamente esses números e registra a alteração no histórico.
- Ao tocar em “Já fiz o pagamento”, a reserva fica aguardando conferência manual, sem expiração automática, para não liberar números de alguém que pagou. A mãe precisa confirmar o pagamento ou liberar a reserva no painel.
- Se a pessoa informar que pagou depois de a reserva vencer, os números permanecem liberados. A tela Pix mostra que a reserva venceu e oculta o código de pagamento. O painel mostra o caso em “Após o prazo”, permite conversar pelo WhatsApp e registrar a solução combinada, como reembolso ou novos números. Um Pix Copia e Cola já copiado não pode ser cancelado pelo aplicativo. Casos após o prazo ainda sem solução impedem o sorteio.
- O painel permite encerrar e reabrir reservas antes do sorteio. Para sortear, a rifa precisa estar encerrada, a data anunciada precisa ter chegado, todas as reservas pendentes precisam estar resolvidas e pelo menos dois números pagos precisam existir. Depois do sorteio, reservas e mudanças de pagamento ficam bloqueadas.
- A home sempre mostra “Ver meus números”. No navegador usado para reservar, essa página oferece links locais para acompanhar cada pagamento; o link também pode ser guardado ao concluir a reserva. A consulta por telefone exibe apenas números e situação das reservas, sem nomes, valores ou links de Pix. Em outro aparelho, peça o link à organização. Telefone sozinho não comprova identidade; se a rifa exigir privacidade maior, adicione verificação por código antes de disponibilizar essa consulta em outra campanha.
- O resultado público fica em `/<slug>/resultado` e mostra apenas números vencedores, data e regras, sem telefone.

## Publicar esta atualização

As mudanças desta revisão não exigem nova migração. Ao publicar outra versão que inclua migrações, faça backup do banco Turso e aplique `npm run db:migrate` antes do deploy. A migração `0003` acrescentou `draws.prize_amount_cents` para registrar o valor do prêmio no momento do sorteio; sorteios antigos sem snapshot continuam usando os valores da rifa. As configurações preservam o total e o Pix das reservas antigas. Confira na Vercel se a branch de produção acompanha `master`.

## Compartilhamento e instalação do painel

Defina `NEXT_PUBLIC_APP_URL` com a origem pública do site, por exemplo `https://seudominio.com`, sem caminho ou barra final. A home gera título, descrição e imagem Open Graph com os dados da rifa e o `shareImage` do tema. O botão **Compartilhar rifa** no painel usa o compartilhamento nativo do celular quando disponível e copia somente o link público como alternativa.

O painel possui um manifest por rifa em `/admin/<slug>/manifest.webmanifest`. O convite de instalação aparece somente no painel autenticado, quando o navegador oferece instalação; no iPhone aparecem instruções curtas para adicionar à tela inicial. A instalação abre o painel da rifa correta, que continua exigindo a senha. Os convidados não veem convite de instalação. O painel tem `noindex,nofollow`.

`DEFAULT_RAFFLE_SLUG` escolhe a rifa aberta por `/`; caso não seja definido, mantém `maria-antonella` como padrão. Para a limpeza diária dos limites de tentativas, configure `CRON_SECRET` na Vercel com uma string aleatória de pelo menos 16 caracteres. `vercel.json` agenda `/api/internal/cleanup-rate-limits` uma vez por dia às 05:00 UTC. Sem o segredo correto, essa rota responde 401.

## Configurações da rifa

Na área da mãe, **Configurações da rifa** permite alterar data do sorteio, dois prêmios, preço por número, quantidade entre 2 e 1000, chave Pix, nome e cidade da recebedora. Valores são guardados em centavos. O preço e os dados Pix novos afetam apenas reservas futuras; se o preço mudou enquanto a participante preenchia a reserva, a tela informa o valor atualizado antes de concluir. Para diminuir a quantidade, todos os números fora da nova faixa precisam estar livres; os registros antigos ficam inativos para preservar o histórico e voltam a ficar disponíveis se a faixa for ampliada. Após o sorteio, as configurações não podem mais ser alteradas.

O botão **Resetar rifa**, nas configurações, exige digitar `RESETAR`. Ele apaga participantes, reservas (inclusive pagas), histórico e resultados do sorteio, libera os números da faixa atual e reabre as reservas. Preço, prêmios, data, quantidade, tema, Pix e senha são mantidos. A exclusão não pode ser desfeita e não realiza reembolsos; guarde os registros de que precisar antes de confirmar. Links de reservas antigas deixam de existir. Nenhuma outra rifa é alterada.

## Nova rifa ou tema

O tema também define `dashboardArt`: a arte aprovada para a inicial administrativa. A atual conserva ícones e lettering originais e cobre todos os valores de exemplo com dados reais. Os espaços dinâmicos seguem as coordenadas da referência 941×1672 em `AdminDashboard.tsx`; uma nova arte deve manter essas áreas ou ajustar as coordenadas. Os textos variáveis usam Dosis, distribuída sob a licença em `public/fonts/Dosis-OFL.txt` ([origem da fonte](https://github.com/google/fonts/tree/main/ofl/dosis)).

Coloque as três molduras, uma imagem de compartilhamento de 1200×630 e ícones de 192×192, 512×512 e 180×180 em `public/themes/<tema>/`. Registre os caminhos, cores e posições de conteúdo em `src/config/themes.ts`. Cada tema define `layout.home`, `layout.guest` e `layout.admin` por `top`, `left`, `right` e `bottom`; assim, outra composição de moldura não exige editar o CSS global. A imagem de compartilhamento fica em `shareImage` e os ícones em `icons`.

Cadastre a nova rifa na tabela `raffles` com um `slug` único e `theme_key` correspondente e gere seus registros em `raffle_numbers` de 1 até `total_numbers`. Informe preço e prêmios em centavos, data no formato `AAAA-MM-DD`, dados Pix e hash de senha. As mesmas rotas `/<slug>` e `/admin/<slug>` funcionarão para essa rifa.

## Vercel

Importe este projeto na Vercel como projeto Next.js. Configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `DEFAULT_RAFFLE_SLUG` e `CRON_SECRET` nas variáveis de ambiente da Vercel. Execute migração e seed no banco Turso antes de liberar a URL. `npm run build` é o comando de compilação. As artes ficam em `public/themes/` e são publicadas junto com o aplicativo.

## Comportamento importante

- Uma transação de escrita confere cada número e desfaz a reserva inteira se algum já estiver ocupado.
- Somente pagamentos confirmados contam no valor arrecadado e participam do sorteio.
- Cada número pago vale uma chance; o sorteio usa aleatoriedade criptográfica do servidor e grava os dois vencedores.
- O QR Code e o código Copia e Cola são gerados a partir do mesmo payload Pix com valor calculado no servidor.
