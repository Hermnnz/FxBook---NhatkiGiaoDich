'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const keySchema = z.object({
  accountId: z.uuid(),
  cycleType: z.enum(['week', 'month']),
  periodStart: z.iso.date(),
  section: z.enum(['edge', 'execution']),
});
const answerKeys = {
  edge: ['edge_pf', 'edge_setup', 'edge_trend', 'edge_priority'],
  execution: ['exec_group', 'exec_pareto', 'exec_gap', 'exec_check', 'exec_commitment'],
};

export type ReviewKey = z.infer<typeof keySchema>;
export type ReviewResult = { success: boolean; answers?: Record<string, string>; error?: string };

function errorMessage(code?: string, message?: string) {
  if (code === '42P01' || code === 'PGRST205') return 'Bảng tự đánh giá chưa có. Cần áp dụng migration 006_report_reviews.sql trên Supabase.';
  return message || 'Không thể truy cập phần tự đánh giá.';
}

export async function getReportReview(input: ReviewKey): Promise<ReviewResult> {
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Kỳ báo cáo không hợp lệ.' };
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { success: false, error: 'Vui lòng đăng nhập.' };
  const key = parsed.data;
  const { data, error } = await client.from('report_review_sections').select('answers')
    .eq('user_id', auth.user.id).eq('account_id', key.accountId)
    .eq('cycle_type', key.cycleType).eq('period_start', key.periodStart)
    .eq('section', key.section).maybeSingle();
  if (error) return { success: false, error: errorMessage(error.code, error.message) };
  const raw = data?.answers;
  const answers: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const id of answerKeys[key.section]) {
      const value = (raw as Record<string, unknown>)[id];
      if (typeof value === 'string') answers[id] = value;
    }
  }
  return { success: true, answers };
}

export async function saveReportReview(input: ReviewKey & { answers: Record<string, string> }): Promise<ReviewResult> {
  const key = keySchema.safeParse(input);
  if (!key.success || !input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
    return { success: false, error: 'Dữ liệu tự đánh giá không hợp lệ.' };
  }
  const allowed = answerKeys[key.data.section] as string[];
  if (Object.keys(input.answers).some((id) => !allowed.includes(id)) ||
    Object.values(input.answers).some((value) => typeof value !== 'string' || value.length > 3000)) {
    return { success: false, error: 'Mỗi câu trả lời tối đa 3.000 ký tự.' };
  }
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { success: false, error: 'Vui lòng đăng nhập.' };
  const { error } = await client.from('report_review_sections').upsert({
    user_id: auth.user.id, account_id: key.data.accountId,
    cycle_type: key.data.cycleType, period_start: key.data.periodStart,
    section: key.data.section, answers: input.answers,
  }, { onConflict: 'user_id,account_id,cycle_type,period_start,section' });
  if (error) return { success: false, error: errorMessage(error.code, error.message) };
  return { success: true, answers: input.answers };
}
