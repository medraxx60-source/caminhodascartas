-- Diagnóstico operacional da emissão Pix. Não inclui perguntas, QR, chave de API ou dados bancários.
-- Colunas aditivas; pedidos antigos permanecem inalterados.
alter table public.orders
  add column if not exists pix_error_code text,
  add column if not exists pix_error_status integer,
  add column if not exists pix_error_at timestamptz;
comment on column public.orders.pix_error_code is 'Código técnico sanitizado da última falha da emissão Wyvi Pay (sem PII)';
comment on column public.orders.pix_error_status is 'HTTP status do provedor, 0 para erro de rede ou configuração';
comment on column public.orders.pix_error_at is 'Momento da última falha da emissão Pix';
