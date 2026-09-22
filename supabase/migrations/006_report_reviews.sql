-- Explicitly record whether the error checklist was reviewed, including "no errors".
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS eval_errors_reviewed boolean NOT NULL DEFAULT false;
UPDATE public.trades SET eval_errors_reviewed = true
  WHERE jsonb_typeof(eval_errors) = 'array' AND jsonb_array_length(eval_errors) > 0;

-- Written reflections belong to one user, account, reporting period and section.
CREATE TABLE public.report_review_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  cycle_type text NOT NULL CHECK (cycle_type IN ('week', 'month')),
  period_start date NOT NULL,
  section text NOT NULL CHECK (section IN ('edge', 'execution')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_review_sections_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES public.accounts(user_id, id) ON DELETE CASCADE,
  CONSTRAINT report_review_sections_unique UNIQUE (user_id, account_id, cycle_type, period_start, section)
);

CREATE TRIGGER trg_report_review_sections_updated_at
  BEFORE UPDATE ON public.report_review_sections FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.report_review_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_reviews_read_own ON public.report_review_sections FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY report_reviews_insert_active ON public.report_review_sections FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
CREATE POLICY report_reviews_update_active ON public.report_review_sections FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
CREATE POLICY report_reviews_delete_active ON public.report_review_sections FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
