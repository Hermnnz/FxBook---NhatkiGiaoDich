'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { localDateKey, scoreReadiness, type ReadinessAnswers } from '@/lib/phase5/readiness';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { useJournalData } from '@/contexts/journal-context';
import type { ReadinessCheck } from '@/types';
import { 
  Loader2, 
  Brain, 
  Target, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  Sparkles 
} from 'lucide-react';

interface QuestionConfig {
  key: keyof ReadinessAnswers;
  number: number;
  title: string;
  subtitle: string;
  options: {
    score: number;
    label: string;
  }[];
}

const QUESTIONS: QuestionConfig[] = [
  {
    key: 'health',
    number: 1,
    title: 'Sức khỏe & Giấc ngủ',
    subtitle: 'Cơ thể và giấc ngủ đêm qua của bạn thế nào?',
    options: [
      { score: 0, label: 'Mệt mỏi, ngủ không đủ giấc' },
      { score: 1, label: 'Bình thường' },
      { score: 2, label: 'Khỏe mạnh, ngủ đủ giấc, tỉnh táo' },
    ],
  },
  {
    key: 'emotion',
    number: 2,
    title: 'Tâm trạng & Cảm xúc',
    subtitle: 'Trạng thái cảm xúc hiện tại của bạn?',
    options: [
      { score: 0, label: 'Tức giận, lo lắng, bồn chồn hoặc muốn gỡ lỗ' },
      { score: 1, label: 'Bình thường' },
      { score: 2, label: 'Bình tĩnh, nhẹ nhàng, sáng suốt' },
    ],
  },
  {
    key: 'focus',
    number: 3,
    title: 'Sự tập trung',
    subtitle: 'Mức độ tập trung của bạn lúc này?',
    options: [
      { score: 0, label: 'Đầu óc nhiều thứ, khó tập trung' },
      { score: 1, label: 'Bình thường' },
      { score: 2, label: 'Đầu óc thảnh thơi, hoàn toàn tập trung' },
    ],
  },
  {
    key: 'streak',
    number: 4,
    title: 'Kết quả giao dịch gần đây',
    subtitle: 'Chuỗi kết quả gần đây ảnh hưởng tâm lý của bạn thế nào?',
    options: [
      { score: 0, label: 'Đang thua lỗ liên tiếp, cảm thấy áp lực' },
      { score: 1, label: 'Kết quả lẫn lộn, không rõ xu hướng' },
      { score: 2, label: 'Đang trong chuỗi kết quả tốt, tâm lý ổn định' },
    ],
  },
  {
    key: 'plan',
    number: 5,
    title: 'Kế hoạch giao dịch hôm nay',
    subtitle: 'Bạn đã chuẩn bị kế hoạch cho hôm nay chưa?',
    options: [
      { score: 0, label: 'Chưa chuẩn bị gì' },
      { score: 1, label: 'Có ý tưởng chung chung' },
      { score: 2, label: 'Có kế hoạch rõ ràng, biết chính xác mình chờ tín hiệu gì' },
    ],
  },
];

const initialAnswers: Record<keyof ReadinessAnswers, number | null> = {
  health: null,
  emotion: null,
  focus: null,
  streak: null,
  plan: null,
};

export default function ReadinessPage() {
  const canWrite = useJournalWritable();
  const { accounts, userEmail } = useJournalData();
  const [answers, setAnswers] = useState(initialAnswers);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const todayKey = localDateKey();

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const client = createClient();
        const { data: auth } = await client.auth.getUser();

        if (!alive) return;

        if (auth?.user) {
          const { data } = await client
            .from('readiness_checks')
            .select('*')
            .eq('user_id', auth.user.id)
            .eq('date', todayKey)
            .maybeSingle();

          if (alive && data) {
            const check = data as ReadinessCheck;
            setAnswers({
              health: check.physical_score,
              emotion: check.mental_score,
              focus: check.market_score,
              streak: check.discipline_score,
              plan: check.plan_score,
            });
          }
        }
      } catch {
        // ignore load errors
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [todayKey]);

  const allAnswered = Object.values(answers).every((v) => v !== null);
  const readinessResult = allAnswered ? scoreReadiness(answers as ReadinessAnswers) : null;

  async function handleSave() {
    if (!allAnswered || !canWrite) return;
    setSaving(true);
    setMessage(null);

    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      const a = answers as ReadinessAnswers;
      const { error } = await client.from('readiness_checks').upsert(
        {
          user_id: auth.user.id,
          date: todayKey,
          physical_score: a.health,
          mental_score: a.emotion,
          market_score: a.focus,
          discipline_score: a.streak,
          plan_score: a.plan,
        },
        { onConflict: 'user_id,date' }
      );

      if (error) throw error;
      setMessage({ text: 'Đã lưu kết quả đánh giá sẵn sàng hôm nay!', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Không lưu được kết quả.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar userEmail={userEmail} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-4xl w-full mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Trạng thái hôm nay
            </h1>
            <p className="text-xs text-zinc-400">
              Tự đánh giá 5 tiêu chí trước khi giao dịch — mỗi câu 0—2 điểm, tổng 10
            </p>
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                message.type === 'success'
                  ? 'bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-[#00e676]" />
              Đang tải khảo sát...
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-6 shadow-sm">
              {QUESTIONS.map((q) => (
                <div key={q.key} className="space-y-2.5">
                  <div className="text-xs font-bold text-zinc-200">
                    {q.number}. {q.title}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {q.subtitle}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {q.options.map((opt) => {
                      const isSelected = answers[q.key] === opt.score;
                      return (
                        <button
                          key={opt.score}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.key]: opt.score }))
                          }
                          className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                            isSelected
                              ? 'bg-[#202924] border-[#00e676] text-white shadow-[0_0_12px_rgba(0,230,118,0.2)]'
                              : 'bg-[#222426] border-[#2e3135] text-zinc-300 hover:border-zinc-500 hover:bg-[#27292d]'
                          }`}
                        >
                          <div
                            className={`text-xs font-bold font-mono mb-1 ${
                              isSelected ? 'text-[#00e676]' : 'text-zinc-200'
                            }`}
                          >
                            {opt.score}
                          </div>
                          <div className="text-[11px] text-zinc-400 leading-snug">
                            {opt.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Comprehensive Trading Psychology & Execution Assessment Card */}
              {readinessResult && (
                <div
                  className={`p-5 rounded-xl border transition-all space-y-4 ${
                    readinessResult.band === 'green'
                      ? readinessResult.tier === 'A-Game'
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                        : 'bg-teal-950/20 border-teal-500/30 text-teal-100 shadow-[0_0_20px_rgba(20,184,166,0.1)]'
                      : readinessResult.band === 'yellow'
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.1)]'
                  }`}
                >
                  {/* Top Header: Score + Tier + Recommended Risk */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-mono font-bold border ${
                          readinessResult.band === 'green'
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-[#00e676]'
                            : readinessResult.band === 'yellow'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                        }`}
                      >
                        <span className="text-base leading-none">{readinessResult.score}</span>
                        <span className="text-[9px] text-zinc-400 leading-none mt-0.5">/100</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${
                              readinessResult.tier === 'A-Game'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : readinessResult.tier === 'B-Game'
                                ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                                : readinessResult.tier === 'Caution'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            }`}
                          >
                            {readinessResult.tierLabel}
                          </span>
                        </div>
                        <h2 className="text-sm font-semibold text-white mt-1">
                          {readinessResult.headline}
                        </h2>
                      </div>
                    </div>

                    {/* Recommended Risk Box */}
                    <div className="bg-black/30 px-3.5 py-2 rounded-lg border border-white/10 flex sm:flex-col justify-between sm:justify-center items-start sm:items-end">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Khối lượng đề xuất</span>
                      <span
                        className={`text-xs sm:text-sm font-bold font-mono ${
                          readinessResult.band === 'green'
                            ? 'text-[#00e676]'
                            : readinessResult.band === 'yellow'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {readinessResult.recommendedRisk}
                      </span>
                    </div>
                  </div>

                  {/* Advice paragraph */}
                  <div className="text-xs text-zinc-300 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="flex items-center gap-1.5 font-semibold text-zinc-200 mb-1">
                      <Brain className="w-3.5 h-3.5 text-blue-400" />
                      <span>Đánh giá tâm lý & Quản trị rủi ro:</span>
                    </div>
                    <p>{readinessResult.advice}</p>
                  </div>

                  {/* Action Points / Checklist */}
                  {readinessResult.actionPoints.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-[#00e676]" />
                        <span>Nguyên tắc hành động phiên hôm nay:</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {readinessResult.actionPoints.map((point, idx) => (
                          <div
                            key={idx}
                            className="text-xs text-zinc-300 flex items-start gap-2 bg-black/20 px-2.5 py-1.5 rounded border border-white/5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#00e676] shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Specific Criteria Diagnostics if any */}
                  {readinessResult.diagnostics.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <div className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Chẩn đoán chi tiết theo từng chỉ số:</span>
                      </div>
                      <div className="space-y-1.5">
                        {readinessResult.diagnostics.map((diag, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded text-xs flex items-start gap-2 border ${
                              diag.type === 'danger'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                                : diag.type === 'warning'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                            }`}
                          >
                            {diag.type === 'danger' ? (
                              <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            ) : diag.type === 'warning' ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-semibold mr-1.5">{diag.title}:</span>
                              <span className="text-zinc-300">{diag.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button: Lưu kết quả hôm nay */}
              <Button
                type="button"
                disabled={!allAnswered || saving || !canWrite}
                onClick={handleSave}
                className="w-full bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-sm py-3 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.35)]"
              >
                {saving ? 'Đang lưu...' : 'Lưu kết quả hôm nay'}
              </Button>
            </div>
          )}

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />
    </div>
  );
}
