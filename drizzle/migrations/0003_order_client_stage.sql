ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_stage text NOT NULL DEFAULT 'pix';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz;