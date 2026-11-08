ALTER TABLE public.free_reading_claims ADD COLUMN IF NOT EXISTS fingerprint text;
CREATE INDEX IF NOT EXISTS free_reading_claims_fp_idx ON public.free_reading_claims (fingerprint);