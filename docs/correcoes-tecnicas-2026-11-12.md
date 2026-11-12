# Correções de 12/11/2026 — Segurança e Pix

## Permissões da base de dados (já aplicado em produção)
As seis tabelas analisadas tinham privilégios excessivos para `anon` e `authenticated`, inclusive TRUNCATE, que ignora a RLS. Uma transação SQL removeu privilégios diretos de ambos e devolveu **somente**:
- `authenticated`: `SELECT, UPDATE` em `lenormand_cards` e `orders` (restrições RLS para admin);
- `authenticated`: `SELECT, UPDATE, DELETE` em `reviews` (RLS para admin);
- `authenticated`: `SELECT` em `user_roles` (RLS própria);
- `service_role` não foi modificado; o servidor continua a criar pedidos, ler settings e gerar leituras.

Nenhuma linha foi removida ou modificada. Executou-se um SELECT de verificação de permissões após COMMIT. Manter grants restritos em futuras migrações e evitar permissões TRUNCATE/REFERENCES/TRIGGER para papéis de cliente.

## Webhooks (código preparado; requer credenciais e cadastro manual no provedor)
Rotas previstas:
- `POST https://caminhodascartas.com.br/api/webhooks/asaas`
- `POST https://caminhodascartas.com.br/api/webhooks/wyvi`

Segredos **somente** no ambiente servidor (nunca no GitHub/cliente):
- `ASAAS_WEBHOOK_TOKEN`: token de autenticação distinto da chave de API, enviado no header `asaas-access-token`.
- `WIVYPAY_WEBHOOK_SECRET`: segredo `whsec_...` recebido **uma única vez** no cadastro do webhook. Validado por HMAC-SHA256 de `{carimbo}.{corpo-cru}` com janela de cinco minutos.

Eventos processados: Asaas `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`; Wyvi Pay `cobranca.paga`. Outras notificações são ignoradas. O servidor **não confia** no valor/evento: usa o ID para encontrar o pedido, depois consulta o intermediador novamente para verificar pagamento e valor. Pedido só é gerado uma vez graças ao claim condicional. O polling atual continua como redundância.

Se o runtime expuser `ctx.waitUntil`, o processamento é executado fora da resposta ao webhook; sem isso, a rota aguarda a verificação, podendo sofrer retentativas do provedor. **Não considerar produção validada sem teste de envio real pelo painel do provedor, observando logs e o link do pedido.** Se o evento não fornecer o ID estático do QR nem referência do pedido, o evento não será associado, e o polling continua sendo o caminho de recuperação. Registrar o destino só depois de confirmar que a nova versão do site está publicada e que o token foi configurado.

Documentação: https://docs.asaas.com/docs/faq-de-webhooks e https://docs.wyvipay.com.br/api-reference/guides/webhooks.

## MandAPI
- Timeout explícito de 70s (abaixo das janelas de retomada); falhas geram erro amigável, sem chamada adicional automática.
- Validação passiva de estrutura (menção às cartas, Conselho dos Anjos e tamanho). Divergências são registradas no servidor, sem bloquear o cliente ou gastar tokens para refazer.
- Quando nenhuma carta é identificável no texto, a tela mostra a interpretação conjunta integral, em vez de perder a explicação.

## Lista de verificação antes de publicar
1. `bun run test`, `bun run build`, TypeScript/lint sem erros novos.
2. Ampliação de 3 para 5/7 cartas no mesmo navegador preserva pergunta e cartas sem inserir texto na URL.
3. Teste mobile com rede lenta; as imagens dos 36 arcanos não devem ser baixadas simultaneamente.
4. Validar Pix do provedor configurado + retentativa/webhook e segurança do token.
5. MandAPI com respostas reais (curta, estruturada, lenta e timeout), sem consumo duplicado e com Base Oracular habilitada somente quando autorizado.
6. Avaliar efeitos das novas permissões via admin (listar e atualizar fichas, aprovar pedidos, moderar avaliações).
7. Validar sitemap/robots no domínio oficial.
