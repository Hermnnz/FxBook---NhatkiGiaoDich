-- Phase 5: private chart images, analysis bias, and server-owned trial records.

ALTER TABLE public.market_analyses
  ADD COLUMN IF NOT EXISTS bias TEXT NOT NULL DEFAULT 'waiting'
  CHECK (bias IN ('bullish', 'bearish', 'neutral', 'waiting'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('charts', 'charts', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "charts_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  paid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trial_dates_valid CHECK (trial_ends_at > trial_started_at)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.create_trial_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, trial_started_at, trial_ends_at)
  VALUES (NEW.id, NEW.created_at, NEW.created_at + INTERVAL '30 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_trial AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_trial_for_new_user();

INSERT INTO public.subscriptions (user_id, trial_started_at, trial_ends_at)
SELECT id, created_at, created_at + INTERVAL '30 days' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
