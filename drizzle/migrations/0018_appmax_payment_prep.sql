-- Preparação para Appmax: somente colunas novas, sem alterar pedidos existentes.
-- NÃO executar/ativar até a homologação do fluxo end-to-end e dos webhooks.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS appmax_customer_id bigint,
  ADD COLUMN IF NOT EXISTS appmax_order_id bigint,
  ADD COLUMN IF NOT EXISTS appmax_pix_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS appmax_init_claimed_at timestamptz;

-- IDs de provedor não podem apontar para o mesmo pedido local.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_appmax_order_unique
  ON public.orders (appmax_order_id) WHERE appmax_order_id IS NOT NULL;

COMMENT ON COLUMN public.orders.payment_provider IS
  'Provedor selecionado no momento da criação, imutável para o pedido. Pedidos históricos permanecem com NULL.';
COMMENT ON COLUMN public.orders.appmax_order_id IS
  'ID remoto da Appmax. Deve ser persistido antes de emitir o Pix; não armazena PII.';
COMMENT ON COLUMN public.orders.appmax_customer_id IS
  'ID de cliente Appmax, sem nome, email, telefone, documento ou IP no pedido local.';
