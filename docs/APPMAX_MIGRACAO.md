# Plano de migração segura — Wyvi Pay → Appmax Pix

**Status:** Preparação técnica, NÃO ativada. Os pedidos existentes seguem com Wyvi Pay e Asaas legado, inclusive os pendentes.

## Documentação oficial verificada em 12/11/2026

- Credenciais para a própria loja: https://docs.appmax.com.br/guides/meus-tokens
- Autenticação Merchant: https://docs.appmax.com.br/api-reference/introduction
- Criar cliente: https://docs.appmax.com.br/api-reference/customers/criar-atualizar
- Criar pedido: https://docs.appmax.com.br/api-reference/orders/criar-pedido
- Pix: https://docs.appmax.com.br/api-reference/payments/pix
- Status: https://docs.appmax.com.br/api-reference/orders/consultar-pedido
- Webhooks (atenção: **webhooks do painel da própria loja**, não da Appstore): https://docs.appmax.com.br/guides/meus-tokens

## Decisões técnicas confirmadas

1. A loja do próprio usuário pode criar credenciais Merchant diretamente no **Painel Appmax → API → Credenciais → Gerar credenciais**. Não precisa criar Appstore para integração própria. O menu API pode depender de permissão do suporte.
2. A Appmax exige uma etapa de identificação: primeiro nome, sobrenome, e-mail, telefone e **IP obtido via Appmax JS** para criar cliente; e `document_number` (CPF/CNPJ legítimo do pagador) no Pix. Não gerar dados fictícios e não mandar PII para MandAPI. Fazer checkout desses dados **apenas na consulta paga**; primeira tiragem grátis deve continuar sem cadastro.
3. Processar **3 chamadas sequenciais depois do token**: cliente (`POST /v1/customers`), pedido digital (`POST /v1/orders`) e Pix (`POST /v1/payments/pix`). Valores em centavos. Armazenar `customer_id` e `order_id` Appmax na ordem local antes de prosseguir, sob lock idempotente de aplicação.
4. O endpoint de links de pagamento exige mínimo **R$ 5,00**. Esse valor NÃO está confirmado como mínimo da API direta de Pix; confirmar com suporte se **R$ 4,90** é aceito no produto de 3 cartas, antes de ativar.
5. O Pix da API entrega código BR/EMV, QR em base64 e expiração. Mostrar esses dados no checkout enxuto e, se houver vencimento, o prazo real fornecido pelo provedor. Não usar QR estático/manual.
6. **Aprovação só após verificação da API** `GET /v1/orders/{order_id}`, confrontando ID remoto, estado (`aprovado`/`integrado`) e valor pago em centavos contra preço servidor; processar webhooks do painel para antecipar a consulta, mas não confiar no webhook isoladamente. Não duplicar geração nem liberar consulta por status não verificado.
7. Webhook: configurar pelo painel Appmax da própria loja; distinguir da Appstore. Segurança do webhook do painel precisa ser verificada na documentação do formato efetivamente recebido. Até confirmar autenticação/origem, tratá-lo apenas como gatilho para consultar status na API.
8. Cada pedido local usa **um único provedor imutável**. Pedidos históricos Wyvi/Asaas continuam sendo consultados pelo mecanismo antigo. Novos só devem virar Appmax quando o fluxo completo estiver homologado em sandbox e produção.
9. O pagamento fica **desativado** se faltarem as credenciais, permissões ou configuração; nunca substituir por Pix manual de terceiro.
10. Armazenar segredos **somente** nas configurações protegidas do servidor Lovable:
    - `APPMAX_ENV=sandbox` (mudar para production apenas no cutover).
    - `APPMAX_MERCHANT_CLIENT_ID`
    - `APPMAX_MERCHANT_CLIENT_SECRET`
    - Chave de habilitação de provedor separada, **desligada por padrão**.
    Não colocar o client_secret no GitHub, prompt ou conversa.

## Pendências para integração ativa

- [ ] Conta Appmax aprovada e perfil de produtor, com menu **API** disponível.
- [ ] Credenciais Merchant de sandbox guardadas em secrets do backend.
- [ ] Verificar se os 3 preços (490, 890 e 1490 centavos) são permitidos para Pix.
- [ ] Confirmar políticas de coleta e retenção de CPF, e-mail, telefone e IP (LGPD).
- [ ] Implementar UI minimalista para dados pagos + coleta pelo Appmax JS.
- [ ] Criar fluxo server-only, com persistência por etapa e proteção a retries; nunca chamar as 3 etapas como uma única requisição com replay cego.
- [ ] Aplicar migração aditiva somente após testes, no ambiente de staging.
- [ ] Configurar webhook do painel e validar a confirmação consultando a API.
- [ ] Testar no **sandbox** Pix aprovado, pendente, expirado, rejeitado, recarregamento após trocar de app e compra via celular.
- [ ] Ativar para novas vendas **somente** depois de homologação e teste controlado.
- [ ] Verificar nome do recebedor no app bancário e taxas/repasses no contrato da conta.

## Escopo deste PR

**Código pronto para testes locais apenas**: `src/lib/appmax-pix.server.ts` com chamadas independentes, parser defensivo, checagem de status e valor, e testes mockados; migração SQL aditiva. **Ainda não modifica a interface, não emite cobrança, não lê secrets e não toca na produção.**

Não alterar Padrão Ouro, Base Oracular, interpretações, valores, limites de gratuidade ou status de pedidos antigos.
