'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { useJournalData } from '@/contexts/journal-context';
import type { PlaybookEntry } from '@/types';
import { GripVertical, Save, Plus, Trash2, X } from 'lucide-react';

export default function PlaybookPage() {
  const canWrite = useJournalWritable();
  const { accounts } = useJournalData();
  const [rows, setRows] = useState<PlaybookEntry[]>([]);
  const [philosophy, setPhilosophy] = useState('');
  const [rules, setRules] = useState<PlaybookEntry[]>([]);
  const [setups, setSetups] = useState<PlaybookEntry[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Add rule modal / inline
  const [addingRule, setAddingRule] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');

  // Add setup modal
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [newSetupTitle, setNewSetupTitle] = useState('');
  const [newSetupDesc, setNewSetupDesc] = useState('');
  const [setupFile, setSetupFile] = useState<File | null>(null);

  // Zoom Lightbox
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const client = createClient();
      const entries: PlaybookEntry[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.from('playbook').select('*')
          .order('sort_order').order('id').range(offset, offset + 999);
        if (error) throw error;
        entries.push(...((data ?? []) as PlaybookEntry[]));
        if ((data ?? []).length < 1000) break;
      }
      setRows(entries);

      const ph = entries.find((e) => e.type === 'philosophy');
      if (ph) setPhilosophy(ph.content ?? '');

      setRules(entries.filter((e) => e.type === 'rule'));
      const setupList = entries.filter((e) => e.type === 'setup');
      setSetups(setupList);

      const urls: Record<string, string> = {};
      for (const item of setupList) {
        if (item.image_url) {
          const { data: signed } = await client.storage
            .from('charts')
            .createSignedUrl(item.image_url, 3600);
          if (signed?.signedUrl) urls[item.id] = signed.signedUrl;
        }
      }
      setImageUrls(urls);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không tải được Playbook.', type: 'error' });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Save Playbook (Philosophy)
  async function handleSavePlaybook() {
    if (!canWrite) return;
    setBusy(true);
    setMessage(null);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      const existingPh = rows.find((r) => r.type === 'philosophy');
      if (existingPh) {
        const { error } = await client
          .from('playbook')
          .update({ content: philosophy.trim() })
          .eq('id', existingPh.id);
        if (error) throw error;
      } else {
        const { error } = await client.from('playbook').insert({
          user_id: auth.user.id,
          type: 'philosophy',
          title: 'Triết lý cốt lõi',
          content: philosophy.trim(),
          sort_order: 0,
        });
        if (error) throw error;
      }

      setMessage({ text: 'Đã lưu Playbook thành công!', type: 'success' });
      await load();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Không lưu được Playbook.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Add rule
  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRuleText.trim() || !canWrite) return;
    setBusy(true);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      const { error } = await client.from('playbook').insert({
        user_id: auth.user.id,
        type: 'rule',
        title: newRuleText.trim(),
        sort_order: rules.length + 1,
      });
      if (error) throw error;

      setNewRuleText('');
      setAddingRule(false);
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không thêm được nguyên tắc.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // Delete rule
  async function handleDeleteRule(id: string) {
    if (!canWrite) return;
    if (!confirm('Xóa nguyên tắc này?')) return;
    try {
      const { error } = await createClient().from('playbook').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không xóa được nguyên tắc.', type: 'error' });
    }
  }

  async function handleReorderRule(from: number, to: number) {
    if (!canWrite || from === to || from < 0 || from >= rules.length || to < 0 || to >= rules.length) return;
    const reordered = [...rules];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setBusy(true);
    try {
      const client = createClient();
      for (let index = 0; index < reordered.length; index++) {
        const { error } = await client.from('playbook').update({ sort_order: index + 1 }).eq('id', reordered[index].id);
        if (error) throw error;
      }
      setRules(reordered);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không sắp xếp được nguyên tắc.', type: 'error' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Add Setup
  async function handleCreateSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetupTitle.trim() || !canWrite) return;
    setBusy(true);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      let imageStoragePath: string | null = null;
      if (setupFile) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(setupFile.type) || setupFile.size > 5 * 1024 * 1024) throw new Error('Chỉ nhận ảnh PNG/JPEG/WebP tối đa 5 MB.');
        const fileExt = setupFile.type === 'image/png' ? 'png' : setupFile.type === 'image/webp' ? 'webp' : 'jpg';
        const fileName = `${auth.user.id}/setups/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadErr } = await client.storage
          .from('charts')
          .upload(fileName, setupFile);
        if (uploadErr) throw uploadErr;
        imageStoragePath = fileName;
      }

      const { error } = await client.from('playbook').insert({
        user_id: auth.user.id,
        type: 'setup',
        title: newSetupTitle.trim(),
        content: newSetupDesc.trim() || null,
        image_url: imageStoragePath,
        sort_order: setups.length + 1,
      });
      if (error) {
        if (imageStoragePath) await client.storage.from('charts').remove([imageStoragePath]);
        throw error;
      }

      setNewSetupTitle('');
      setNewSetupDesc('');
      setSetupFile(null);
      setSetupModalOpen(false);
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không thêm được setup.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // Delete setup
  async function handleDeleteSetup(setup: PlaybookEntry) {
    if (!canWrite) return;
    if (!confirm(`Xóa setup "${setup.title}"?`)) return;
    try {
      const client = createClient();
      const { error } = await client.from('playbook').delete().eq('id', setup.id);
      if (error) throw error;
      if (setup.image_url) {
        await client.storage.from('charts').remove([setup.image_url]);
      }
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không xóa được setup.', type: 'error' });
    }
  }

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#27292d]/60">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                Trading Playbook
              </h1>
              <p className="text-xs text-zinc-400">
                Triết lý · Nguyên tắc · Thư viện thiết lập giao dịch
              </p>
            </div>

            <Button
              onClick={handleSavePlaybook}
              disabled={busy || !canWrite}
              className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.35)] flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Playbook</span>
            </Button>
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

          {/* 1. TRIẾT LÝ CỐT LÕI */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="text-xs font-bold text-[#00e676] uppercase tracking-wider flex items-center gap-1.5">
              <span>🧠</span>
              <span>TRIẾT LÝ CỐT LÕI</span>
            </div>

            <textarea
              value={philosophy}
              onChange={(e) => setPhilosophy(e.target.value)}
              placeholder="Viết triết lý giao dịch của bạn... Ví dụ: 'Tôi chỉ giao dịch khi thị trường đang ở trạng thái phù hợp với hệ thống — không có setup thì không vào lệnh. Vốn được bảo toàn là ưu tiên số 1.'"
              rows={4}
              className="w-full rounded-lg border border-[#2e3135] bg-[#222426] p-3 text-xs text-zinc-200 focus:outline-none focus:border-[#00e676] leading-relaxed"
            />

            <div className="text-[11px] text-zinc-500">
              Nhấn vào đoạn văn để chỉnh sửa. Tự động lưu khi bấm &quot;Lưu Playbook&quot;.
            </div>
          </section>

          {/* 2. NGUYÊN TẮC GIAO DỊCH */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[#00e676] uppercase tracking-wider flex items-center gap-1.5">
                <span>📌</span>
                <span>NGUYÊN TẮC GIAO DỊCH</span>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingRule(true)}
                disabled={!canWrite || busy}
                className="border-[#2e3135] bg-[#222426] text-xs h-7 px-3 text-zinc-300 hover:text-white"
              >
                + Thêm nguyên tắc
              </Button>
            </div>

            {addingRule && (
              <form onSubmit={handleAddRule} className="flex items-center gap-2 p-3 rounded-lg bg-[#222426] border border-[#2e3135]">
                <Input
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  placeholder="Nhập nguyên tắc giao dịch (vd: Tuyệt đối không dời Stop Loss)..."
                  className="bg-[#181a1b] border-[#2e3135] text-xs h-8"
                  autoFocus
                />
                <Button type="submit" size="sm" className="bg-[#00e676] text-zinc-950 font-bold text-xs h-8">
                  Lưu
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingRule(false)}
                  className="text-zinc-400 hover:text-white text-xs h-8"
                >
                  Hủy
                </Button>
              </form>
            )}

            {rules.length === 0 ? (
              <div className="text-xs text-zinc-500 py-3">
                Chưa có nguyên tắc nào. Nhấn &quot;+ Thêm nguyên tắc&quot; để bắt đầu.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((r, index) => (
                  <div
                    key={r.id}
                    draggable={canWrite && !busy}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                    onDragOver={(event) => { if (canWrite) event.preventDefault(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(event.dataTransfer.getData('text/plain'));
                      if (Number.isInteger(from)) void handleReorderRule(from, index);
                    }}
                    className="p-3 rounded-lg bg-[#222426] border border-[#2e3135] flex items-center justify-between text-xs text-zinc-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <GripVertical aria-label="Kéo để sắp xếp" className="size-3.5 cursor-grab text-zinc-500" />
                      <span className="font-mono font-bold text-[#00e676]">{index + 1}.</span>
                      <span>{r.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(r.id)}
                      disabled={!canWrite || busy}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. THƯ VIỆN THIẾT LẬP GIAO DỊCH (SETUP LIBRARY) */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="text-xs font-bold text-[#00e676] uppercase tracking-wider flex items-center gap-1.5">
                <span>🖼️</span>
                <span>THƯ VIỆN THIẾT LẬP GIAO DỊCH (SETUP LIBRARY)</span>
              </div>
              <div className="text-[10px] text-zinc-500 tracking-tight font-mono">
                NHẤN ẢNH ĐỂ XEM TO · NHẤN ẢNH ĐỂ CHỈNH SỬA
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Add Setup Card (Dashed Border) */}
              <button
                type="button"
                onClick={() => setSetupModalOpen(true)}
                disabled={!canWrite}
                className="min-h-[160px] p-4 rounded-xl border-2 border-dashed border-[#2e3135] bg-[#1a1c1e] hover:border-[#00e676]/60 hover:bg-[#202225] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full bg-[#24272a] text-[#00e676] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="text-xs font-bold text-zinc-200">Thêm thiết lập</div>
                <div className="text-[10px] text-zinc-500">Tải ảnh chart lên</div>
              </button>

              {/* Setups list */}
              {setups.map((s) => {
                const img = imageUrls[s.id];
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[#27292d] bg-[#222426] overflow-hidden flex flex-col justify-between group"
                  >
                    {img ? (
                      <div
                        className="relative h-32 w-full bg-black cursor-zoom-in"
                        onClick={() => setZoomImage(img)}
                      >
                        <Image
                          unoptimized
                          src={img}
                          alt={s.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    ) : (
                      <div className="h-28 w-full bg-[#181a1b] flex items-center justify-center text-xs text-zinc-600">
                        Chưa có ảnh chart
                      </div>
                    )}

                    <div className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-white">{s.title}</div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSetup(s)}
                          disabled={!canWrite || busy}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {s.content && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2">
                          {s.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />

      {/* Zoom Image Lightbox Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoomImage} alt="Setup zoom" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        </div>
      )}

      {/* Modal Add Setup */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1a1c1e] border border-[#27292d] rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Thêm thiết lập giao dịch mới</h3>
              <button
                type="button"
                onClick={() => setSetupModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSetup} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tên thiết lập (Setup) *</label>
                <Input
                  value={newSetupTitle}
                  onChange={(e) => setNewSetupTitle(e.target.value)}
                  placeholder="Breakout & Retest, FVG Sweep..."
                  className="bg-[#222426] border-[#2e3135] text-xs h-8"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mô tả / Điều kiện vào lệnh</label>
                <textarea
                  value={newSetupDesc}
                  onChange={(e) => setNewSetupDesc(e.target.value)}
                  placeholder="Quy tắc nến, cấu trúc thị trường, tiêu chí SL/TP..."
                  rows={3}
                  className="w-full rounded-md border border-[#2e3135] bg-[#222426] p-2 text-xs text-zinc-200 focus:outline-none focus:border-[#00e676]"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Ảnh chụp biểu đồ mẫu</label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setSetupFile(e.target.files?.[0] ?? null)}
                  className="bg-[#222426] border-[#2e3135] text-xs h-8"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSetupModalOpen(false)}
                  className="text-zinc-400 text-xs"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !canWrite}
                  size="sm"
                  className="bg-[#00e676] text-zinc-950 font-bold text-xs"
                >
                  {busy ? 'Đang tải...' : 'Thêm thiết lập'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
