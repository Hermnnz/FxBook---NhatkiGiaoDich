'use client';

import { startTransition, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getReportReview, saveReportReview, type ReviewKey } from '@/lib/actions/report-reviews';
import { REPORT_QUESTIONS } from '@/lib/report-analytics';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';

export function ReportReviewForm({ reviewKey }: { reviewKey: ReviewKey }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('Đang tải tự đánh giá…');
  const [saving, setSaving] = useState(false);
  const writable = useJournalWritable();
  const { accountId, cycleType, periodStart, section } = reviewKey;

  useEffect(() => {
    let alive = true;
    startTransition(() => {
      getReportReview({ accountId, cycleType, periodStart, section }).then((result) => {
        if (!alive) return;
        if (result.success) { setAnswers(result.answers ?? {}); setStatus(''); }
        else setStatus(result.error ?? 'Không tải được tự đánh giá.');
      }).catch(() => { if (alive) setStatus('Không tải được tự đánh giá.'); });
    });
    return () => { alive = false; };
  }, [accountId, cycleType, periodStart, section]);

  async function save() {
    setSaving(true);
    setStatus('Đang lưu…');
    try {
      const result = await saveReportReview({ ...reviewKey, answers });
      setStatus(result.success ? 'Đã lưu tự đánh giá cho kỳ này.' : result.error ?? 'Không lưu được.');
    } catch { setStatus('Không lưu được tự đánh giá.'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4 rounded-xl border border-[#30343a] bg-[#1a1c1e] p-5">
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Tự đánh giá — {section === 'edge' ? 'Hệ thống có lợi thế không?' : 'Thực thi có vấn đề không?'}</h3>
      <p className="mt-1 text-xs text-zinc-400">Các câu hỏi gợi ý suy nghĩ, không có câu trả lời đúng hay sai. Lưu riêng theo tài khoản và kỳ báo cáo.</p>
    </div>
    {REPORT_QUESTIONS[section].map(([id, question, hint]) => <label key={id} className="block space-y-1.5">
      <span className="block text-sm font-semibold text-zinc-200">{question}</span>
      <span className="block text-xs italic text-zinc-500">{hint}</span>
      <textarea value={answers[id] ?? ''} onChange={(event) => { setAnswers((a) => ({ ...a, [id]: event.target.value })); setStatus('Chưa lưu thay đổi.'); }}
        maxLength={3000} rows={3} disabled={!writable}
        className="w-full resize-y rounded-lg border border-[#34383d] bg-[#202326] p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500 disabled:opacity-60"
        placeholder="Ghi nhận xét của bạn…" />
    </label>)}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span role="status" className="text-xs text-zinc-400">{status || (!writable ? 'Tài khoản hiện chỉ có quyền đọc.' : '')}</span>
      <button type="button" onClick={save} disabled={saving || !writable}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#101816] hover:bg-emerald-400 disabled:opacity-50">
        <Save className="h-4 w-4" /> Lưu tự đánh giá
      </button>
    </div>
  </div>;
}
