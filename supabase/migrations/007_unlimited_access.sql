-- Migration 007: Mở khóa vĩnh viễn, gỡ bỏ giới hạn dùng thử (trial 30 ngày)
-- Cho phép can_write_journal luôn trả về true để user toàn quyền thêm/sửa/xóa dữ liệu

CREATE OR REPLACE FUNCTION public.can_write_journal()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.can_write_journal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_journal() TO authenticated;

-- Gia hạn bảng subscriptions lên 100 năm nếu bảng tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    UPDATE public.subscriptions
    SET paid_until = now() + INTERVAL '100 years',
        trial_ends_at = now() + INTERVAL '100 years';
  END IF;
END $$;
