-- Migration 007: Gỡ bỏ hoàn toàn mọi giới hạn thời hạn, dùng thử (Trial) và khóa chỉ đọc
-- Phục hồi quyền quản trị dữ liệu vĩnh viễn (Full CRUD) cho người dùng

-- 1. Cho hàm can_write_journal luôn trả về true
CREATE OR REPLACE FUNCTION public.can_write_journal()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.can_write_journal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_journal() TO authenticated;

-- 2. Gia hạn bảng subscriptions lên 100 năm nếu bảng tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    UPDATE public.subscriptions
    SET paid_until = now() + INTERVAL '100 years',
        trial_ends_at = now() + INTERVAL '100 years';
  END IF;
END $$;

-- 3. Phục hồi toàn bộ RLS Policies về chế độ chuẩn vĩnh viễn (người dùng tự do thêm/sửa/xóa dữ liệu của mình)
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts', 'account_transactions', 'trades', 'market_analyses', 'readiness_checks', 'playbook', 'settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_insert_active', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_update_active', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_delete_active', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_read_own', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own ' || table_name, table_name);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)', 'Users can manage own ' || table_name, table_name);
  END LOOP;
END;
$$;

-- 4. Phục hồi quyền tải và quản lý ảnh biểu đồ (Storage charts bucket)
DROP POLICY IF EXISTS "charts_insert_active" ON storage.objects;
DROP POLICY IF EXISTS "charts_update_active" ON storage.objects;
DROP POLICY IF EXISTS "charts_delete_active" ON storage.objects;
DROP POLICY IF EXISTS "charts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_update_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_delete_own" ON storage.objects;

CREATE POLICY "charts_manage_own" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
