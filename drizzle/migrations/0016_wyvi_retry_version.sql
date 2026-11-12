-- Compatibilidade da cobrança Pix Wyvi v1 (pedidos antigos) com v2 (novos).
-- Não altera pedidos existentes nem valores; apenas adiciona metadados.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_api_version text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_last_attempt_at timestamptz;
-- Pedidos existentes ficam NULL e continuam podendo repetir o POST v1 original.
-- Novos pedidos passam a usar v2 e armazenam essa escolha explicitamente.
