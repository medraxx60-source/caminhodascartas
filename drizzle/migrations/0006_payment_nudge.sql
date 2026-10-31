ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_nudged_at timestamptz;
