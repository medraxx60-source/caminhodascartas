# Consultas gratuitas: conversão, consistência e proteção

## Objetivo e limites desta proposta

Preparar uma melhoria simples e gradual da primeira consulta gratuita do Caminho das Cartas, sem cadastro ou telefone. Este plano não executa mudanças: limites, dados, código, pagamentos e elegibilidade permanecem como estão.

Preservar uma gratuidade por identificador de navegador, exatamente três cartas e o fluxo gratuito existente. A Base Oracular permanece privada e desconectada; consultas pagas, Pix, histórico e prompt/modelo da interpretação não serão alterados.

## Arquitetura recomendada

- **Identificação individual:** manter o identificador do navegador. Ele distingue instalações do navegador, não comprova uma pessoa ou aparelho físico. Não prometer identificação infalível após limpar dados ou trocar de navegador/domínio.
- **Elegibilidade:** o servidor determina se a própria gratuidade já foi consumida. O IP não pode produzir essa conclusão.
- **Proteção de rede:** usar o IP como sinal de excesso em períodos curtos e de concentração de tentativas. A assinatura do dispositivo é apenas complementar, nunca motivo único de bloqueio.
- **Consistência:** reserva, vínculo do pedido e conclusão protegidos por operações transacionais e idempotentes. A geração da IA ocorre fora da transação; a finalização salva texto e consumo juntos.
- **Custos:** reservar margem de orçamento antes de cada chamada à IA, incluindo novas tentativas; reconciliar o custo quando houver dados confiáveis do provedor.
- **Experiência:** restrição temporária não altera automaticamente uma consulta grátis para paga. Mostrar o motivo correto, preservar pergunta/cartas e oferecer tentativa posterior ou planos com preços explícitos.

O backend não dispõe de um recurso padrão de limitação de requisições. A alternativa simples seria um controle específico persistido no banco, com manutenção e testes próprios. **Essa escolha exige confirmação explícita antes de implementar.** Não é proteção completa contra ataques volumétricos.

## Etapa 1 — Preparar testes isolados e medir a situação atual

**Alterações futuras:** criar um ambiente de homologação com banco independente, preferindo um draft identificado pela plataforma como tendo sua própria base de testes. Se isso não estiver disponível, usar um projeto de testes separado. Reutilizar a estrutura necessária e dados fictícios, sem importar consultas, contatos ou histórico reais. Conferir configurações tanto do navegador quanto do servidor; nome “preview” ou “draft” sozinho não comprova isolamento.

Desativar pagamentos reais, Telegram e outras notificações nesse ambiente. Não copiar credenciais de pagamento. A IA começa simulada; chamadas reais ficam desativadas por padrão, com autorização explícita e limite de execuções.

Registrar motivos de inelegibilidade e tentativas para avaliar bloqueios, retomadas e custo, sem registrar perguntas, interpretações ou IPs completos nos registros técnicos. Definir retenção mínima necessária e revisar a transparência sobre a assinatura do dispositivo.

**Testes:** comprovar que uma gravação de teste aparece somente na homologação; verificar separação de servidor/navegador, identificadores e histórico; confirmar ausência de cobranças e notificações externas. Só depois executar o fluxo gratuito com dados fictícios.

**Riscos:** ambiente apontar acidentalmente para produção; copiar dados pessoais; chamadas reais consumirem saldo. Isolamento comprovado é condição para avançar. O preview atual compartilha produção e não serve para esse teste.

## Etapa 2 — Separar elegibilidade de proteção e corrigir mensagens

**Alterações futuras:** substituir a resposta apenas “elegível/não elegível” por motivos seguros e explícitos: disponível, gratuidade própria consumida, leitura em andamento, restrição temporária da rede, verificação necessária, orçamento indisponível e falha de verificação. Não divulgar detalhes que facilitem abuso.

Adotar tratamento conservador para erros de consulta: não interpretar erro como contagem zero, nem afirmar consumo anterior sem evidência. Manter validação definitiva na confirmação pelo servidor, mesmo quando a tela já mostrou gratuidade.

**Mensagens propostas:**

- Uso próprio: “Você já aproveitou sua primeira consulta gratuita. Conheça as próximas tiragens e seus valores.”
- Rede: “Há muitas solicitações nesta conexão no momento. Isso não significa que você já usou seu presente. Tente novamente mais tarde.”
- Em andamento: “Sua consulta gratuita já está sendo preparada. Vamos retomar a mesma leitura.”
- Falha de verificação: “Não conseguimos verificar a disponibilidade agora. Tente novamente em instantes.”

Mostrar horário de nova tentativa somente quando calculável. Nunca atribuir a um visitante o consumo de outras pessoas da rede.

**Testes:** navegador já consumido; navegador novo em rede restrita; leitura em andamento; consulta ao banco indisponível; tela desatualizada frente ao servidor; mudança de disponibilidade antes da confirmação. Verificar ausência de abertura automática de Pix ou criação de pedido pago.

**Riscos:** visitante escolher cartas enquanto a disponibilidade muda. Preservar sua seleção e explicar a situação, sem cobrança ou conversão automática.

## Etapa 3 — Corrigir reservas, retomadas e conclusão

**Alterações futuras:**

1. Contar apenas reservas válidas e consumos aplicáveis à janela; ignorar reservas vencidas mesmo sem limpeza prévia. A limpeza não pode ser condição para obter a contagem correta.
2. Reservar a gratuidade e criar/vincular o pedido na mesma transação, com repetição segura da solicitação. Retomar o mesmo pedido, não criar outro.
3. Remover a tolerância implícita de “limite + 1” na retomada. Uma tentativa do mesmo pedido não vira uma gratuidade adicional; se sua reserva expirou ou foi liberada, readmiti-la pelas mesmas regras vigentes.
4. Proteger cada tentativa de geração com identificador e validade renovável. Uma resposta atrasada de tentativa substituída não pode sobrescrever a tentativa atual.
5. Finalizar em uma transação: validar a tentativa, salvar interpretação e marcar consumo. Repetir a finalização devolve a leitura existente sem novo consumo.
6. Diferenciar falha da IA de falha ao salvar. Se houver texto gerado, tentar salvar esse mesmo resultado antes de chamar a IA novamente. Nenhuma transação no banco torna uma chamada externa exatamente única; interrupções exigem tratamento explícito.

**Testes:** duas abas simultâneas; duplo toque; reserva vencida sem limpeza; retomada antes/depois do vencimento; IA falhando; gravação falhando; resposta atrasada; finalização repetida; leitura já concluída. Comprovar três cartas distintas, zero preço, no máximo uma gratuidade consumida por identificador e inexistência de pedido pago.

**Riscos:** alterar o ciclo das reservas pode afetar pedidos gratuitos antigos. Prever compatibilidade, identificar inconsistências existentes e não apagar/reclassificar histórico automaticamente. Submeter qualquer reparo de dados separadamente.

## Etapa 4 — Reduzir falsos bloqueios e conter abuso

**Alterações futuras, condicionadas à confirmação do controle específico:** substituir o teto rígido de três consumos por IP em 30 dias por detecção de rajadas e concentração em janelas curtas. Manter o consumo por navegador como regra individual. Não definir novos números neste plano; usar medições de tráfego e custo para propor valores antes da ativação.

Primeiro calibrar sinais em modo de observação na homologação e, se autorizado, em produção sem aplicar novos bloqueios. Excesso moderado pode pedir verificação antibot; excesso forte pode causar espera temporária. A assinatura de dispositivo não decide sozinha.

Avaliar Cloudflare Turnstile, com validação do comprovante no servidor antes da geração, somente para situações suspeitas. A disponibilidade e a configuração do serviço devem ser confirmadas antes da integração. Limitação e orçamento continuam necessários: passar na verificação não autoriza gerações ilimitadas.

**Testes:** vários navegadores legítimos no mesmo IP; tentativas repetidas pelo mesmo navegador; muitos identificadores em sequência; mudança de IP; comprovante antibot inválido, vencido ou reutilizado; indisponibilidade do serviço; retomada de um pedido não contar como novo visitante. Validar em iPhone/Android, inclusive navegador interno de redes sociais.

**Riscos:** IP móvel compartilhado, VPN, automação distribuída e assinatura variável. Verificação antibot também pode falhar para pessoas reais; oferecer recuperação e mensagem temporária, sem cadastro obrigatório. Não prometer eliminação total de abuso.

## Etapa 5 — Proteger o orçamento das gratuidades

**Alterações futuras:** propor um teto diário e, opcionalmente, mensal exclusivos da IA das consultas gratuitas, com valor aprovado pelo dono. A reserva financeira deve ocorrer atomicamente antes de cada chamada, evitando que solicitações simultâneas ultrapassem a margem disponível.

Medir uso e confirmar preços do provedor. Sem custo confiável por chamada, usar margem conservadora e limite de chamadas como proteção operacional, sem chamar isso de teto monetário exato. Um teto financeiro rigoroso também depende de preço conhecido, limites de tokens e/ou bloqueio oferecido pelo provedor; não alterar a configuração compartilhada da IA paga para obtê-lo.

Falha da IA libera o direito à gratuidade, mas **não apaga eventual custo cobrado pelo provedor**. Uma nova chamada exige nova autorização de orçamento. Em interrupção com custo desconhecido, manter margem conservadora até reconciliação.

Quando não houver orçamento, não iniciar novas chamadas, não consumir a gratuidade e não cobrar. Preservar pergunta/cartas para tentar depois. Mensagem: “As consultas gratuitas estão temporariamente indisponíveis. Seu presente não foi utilizado. Tente novamente mais tarde.” Planos pagos são uma escolha separada, com preço antes da confirmação. Pedidos já admitidos têm margem reservada para terminar.

**Testes:** última margem disputada por requisições simultâneas; virada do período; falha cobrada pela IA; custo desconhecido; retomada com/sem margem; consultas pagas funcionando com orçamento gratuito esgotado.

**Riscos:** custo estimado diferente do real e mais chamadas por falhas. Começar com margem prudente; separar as métricas de homologação das de produção, mesmo se usarem o mesmo saldo do provedor.

## Etapa 6 — Validar a geração real e liberar gradualmente

**Testes finais:**

- Testes automáticos das regras e transações com IA simulada, sem custo do provedor.
- Um teste completo autorizado na homologação: visitante novo → plano grátis de três cartas → pergunta → ritual → seleção → geração real → leitura salva → histórico → segunda tentativa recusada por uso próprio.
- Confirmar que nenhuma reserva, pedido ou consumo desse teste aparece em produção. Registrar o custo real da chamada separadamente; não existe garantia de IA gratuita em teste.
- Testar celular de 390 px e outros tamanhos, navegação interna, recarregamento, rede interrompida, abas concorrentes, visitante já consumido e visitante novo no mesmo IP.
- Verificar regressão paga sem transações financeiras reais: preços, pedidos, histórico e integração preservados. Não alegar pagamento real ponta a ponta sem transação autorizada.

**Liberação:** somente após revisão dos resultados, confirmação do controle específico, aprovação dos limites e do orçamento. Migrações compatíveis entram antes do novo código; mudanças no banco atingem produção imediatamente, mesmo sem publicar o site. Adotar ativação gradual e opção de desativar a nova proteção sem apagar pedidos ou restaurar a base inteira. Em falha grave, suspender novas gerações gratuitas com mensagem clara, preservando direitos e consultas pagas.

## Decisões antes da implementação

1. Confirmar o uso de controle específico no banco, já que não há recurso padrão de limitação.
2. Comprovar um ambiente com base isolada e autorizar as chamadas reais de teste.
3. Aprovar janelas e limiares após medição; nenhum aumento está autorizado por este plano.
4. Aprovar o orçamento gratuito e a estratégia quando custos não forem conhecidos.
5. Decidir a ativação condicional do antibot após validar serviço e impactos.

**Recomendação de ordem:** isolamento → motivos e mensagens → consistência → proteção calibrada → orçamento → teste real e liberação. Não começar simplesmente aumentando o limite por IP.