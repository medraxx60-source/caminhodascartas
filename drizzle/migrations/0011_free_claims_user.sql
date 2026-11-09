ALTER TABLE public.free_reading_claims ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS free_reading_claims_user_idx ON public.free_reading_claims(user_id);