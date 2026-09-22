-- An expired trial is read-only. Users retain SELECT/export access to their own data.
-- The trusted database administrator can extend paid_until; clients cannot edit subscriptions.

CREATE OR REPLACE FUNCTION public.can_write_journal()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = (SELECT auth.uid())
      AND (s.trial_ends_at > now() OR s.paid_until > now())
  );
$$;
REVOKE ALL ON FUNCTION public.can_write_journal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_journal() TO authenticated;

DO $$
DECLARE
  table_name text;
  old_policy text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts', 'account_transactions', 'trades', 'market_analyses', 'readiness_checks', 'playbook', 'settings'] LOOP
    old_policy := 'Users can manage own ' || table_name;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', table_name || '_read_own', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_insert_active', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal())) WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_update_active', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_delete_active', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "charts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_update_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_delete_own" ON storage.objects;
CREATE POLICY "charts_insert_active" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
CREATE POLICY "charts_update_active" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()))
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
CREATE POLICY "charts_delete_active" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
