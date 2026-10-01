# Correções da revisão de entrega

Esta página registra o tratamento dos achados em [REVISAO-2026-09-26.md](REVISAO-2026-09-26.md). O relatório original é um retrato anterior às correções.

| Achados | Resultado |
| --- | --- |
| A1, A2 — Pix | Chaves de celular, CPF, CNPJ, e-mail e UUID agora são validadas no formulário, API, seed e configuração. Celular é normalizado com `+55`; o exemplo remoto de celular foi normalizado sem alterar códigos das reservas antigas. Uma cidade legada longa já não impede salvar data ou prêmio; ao editar os dados Pix, a cidade precisa ter até 15 caracteres. |
| A3, B2 — Tela Pix | A tela consulta o status ao abrir, recuperar foco, a cada 30 segundos e ao chegar o prazo. Ela oculta QR e código quando a reserva venceu, quando o pagamento foi informado e quando foi confirmado; um aviso tardio atualiza a própria tela. |
| A4 — Sorteio | Um pagamento informado após o prazo e ainda sem solução bloqueia o sorteio, tanto na regra transacional quanto no painel. |
| A5 — Telas baixas | Painéis passam a rolar internamente em alturas de até 600 px; a grade recebe altura útil mínima. |
| B1 — Retorno à reserva | “Ver meus números” aparece sempre. O navegador usado para reservar guarda links locais para acompanhar pagamentos; a consulta por telefone continua sem revelar o link privado. |
| B3 — Limite de reservas | A cota de três reservas por telefone em 24 horas é contabilizada dentro da transação concluída. Conflitos de número não consomem a cota; limites de requisição por IP continuam ativos. |
| B4–B7 — Painel e preço | Busca numérica aceita `2` e `02`; quantidade mínima passou a 2; preço desatualizado exige nova confirmação; ações bloqueadas após sorteio desaparecem; erros de sessão e do diálogo de sorteio são apresentados no lugar certo. |
| B8 — Dependências | Drizzle ORM e PostCSS foram atualizados. `npm audit --omit=dev` retorna zero avisos. |
| Refinamentos menores | Alvos de toque e textos pequenos foram ampliados; Pix ganhou saídas para início e Meus números; erros/404 em português; armazenamento local não bloqueia o fluxo; contagem usa “reservas”; painel atualiza ao voltar e periodicamente; reservas legadas sem prazo recebem tratamento de expiração. |

## Verificação

- `npm run build`, `npm run lint`, `npm run typecheck`, 9 testes unitários e `npm run test:integration`: passaram.
- A integração cobre dados Pix novos e antigos, preço alterado, cotas, expiração, aviso tardio, fechamento, sorteio e sessões em banco descartável.
- Chrome com emulação de 844×390: grade com 211 px de área útil, conteúdo rolável; participantes com 485 px de lista, conteúdo rolável. Em 320×700: grade com 231 px, sem rolagem horizontal. A moldura ocupa a altura total nos três casos.
- `npm audit --omit=dev`: zero avisos. O audit completo ainda aponta avisos moderados em dependências de desenvolvimento transitivas de `drizzle-kit`; não entram no pacote de produção.
- Não foi necessária nova migration.

## Antes de receber pagamentos reais

A cliente precisa preencher **a própria chave Pix, o nome de recebedora e a cidade** em Configurações da rifa. Os dados atuais são exemplos do desenvolvimento. A validação verifica formato e limites do código, mas não confirma titularidade nem registro da chave no banco; conferir esses dados com a cliente e testar um pagamento real de baixo valor pertence à entrega operacional. A cidade de exemplo existente tem mais de 15 caracteres e será substituída pela cidade que ela escolher. Códigos Pix já gerados nas reservas antigas continuam intactos.

O histórico administrativo continua identificando “Painel da mãe” porque existe uma senha compartilhada. Se mais de uma pessoa for operar o painel com atribuição individual, será necessário criar contas próprias. A recuperação de link privado em outro aparelho exige suporte da organização; a consulta por telefone mostra somente números e status.

**Senha do painel:** por solicitação da responsável, o mínimo de configuração foi reduzido para quatro caracteres. O login tem limite de tentativas, mas senhas curtas continuam fáceis de adivinhar; substitua a senha atual por uma longa assim que possível. A credencial não é armazenada neste repositório.
