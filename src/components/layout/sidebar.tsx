'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  MessageSquare,
  ChevronLeft,
} from 'lucide-react';
import { useJournalData } from '@/contexts/journal-context';
import { Button } from '@/components/ui/button';
import { SubscriptionBanner } from '@/components/phase5/subscription-banner';

interface SidebarProps {
  userEmail?: string | null;
}

interface NavItem {
  href: string;
  label: string;
  emoji: string;
  isExternalOrModal?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'CHÍNH',
    items: [
      { href: '/', label: 'Dashboard', emoji: '📊' },
      { href: '/report', label: 'Báo cáo', emoji: '📑' },
      { href: '/history', label: 'Lịch sử lệnh', emoji: '📋' },
    ],
  },
  {
    title: 'PHÂN TÍCH',
    items: [
      { href: '/calendar', label: 'Lịch kinh tế', emoji: '🗓️' },
      { href: '/readiness', label: 'Sẵn sàng giao dịch', emoji: '✅' },
      { href: '/analysis', label: 'Phân tích thị trường', emoji: '📊' },
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { href: '/playbook', label: 'Trading Playbook', emoji: '📖' },
      { href: '/settings', label: 'Cài đặt', emoji: '⚙️' },
      { href: '/account', label: 'Tài khoản', emoji: '👤' },
      { href: '#huong-dan', label: 'Hướng dẫn', emoji: '❓', isExternalOrModal: true },
    ],
  },
];

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { accounts, trades, selectedAccountId, userEmail: contextEmail } = useJournalData();

  const tradeCount = trades.length;
  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const activeAccountName = activeAccount
    ? activeAccount.name
    : accounts.length === 1
    ? accounts[0].name
    : 'Tất cả tài khoản';

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        aria-label="Mở điều hướng"
        variant="outline"
        size="icon"
        className="fixed bottom-4 left-4 z-40 shadow-lg lg:hidden bg-[#181a1b] border-zinc-800 text-white"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <button
          aria-label="Đóng điều hướng"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-[#27292d] bg-[#181a1b] text-zinc-300 transition-transform lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Header & Brand */}
        <div>
          <div className="p-4 border-b border-[#27292d] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#00e676]/40 bg-zinc-800 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/avatar.png"
                  alt="FxBook Duck Avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <div className="font-bold text-sm tracking-tight text-white uppercase">
                  FxBook
                </div>
                <div className="text-[11px] text-zinc-400 font-medium">Trading Journal</div>
                <div
                  className="max-w-36 truncate text-[10px] text-zinc-500 font-mono"
                  title={userEmail ?? contextEmail ?? undefined}
                >
                  {userEmail ?? contextEmail ?? 'ndanh.fin@gmail.com'}
                </div>
              </div>
            </div>

            <Button
              aria-label="Đóng menu"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" />
            </Button>
            <button
              aria-label="Thu gọn sidebar"
              className="hidden lg:flex items-center justify-center h-6 w-6 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>

          {/* Grouped Navigation Links */}
          <nav className="p-3 space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-3 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : !item.isExternalOrModal && pathname.startsWith(item.href);

                  if (item.isExternalOrModal) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          alert(
                            '📖 Hướng dẫn sử dụng FxBook:\n\n1. Tạo tài khoản trong Cài đặt (FTMO, Demo...)\n2. Tự kiểm tra tâm lý trước phiên tại "Sẵn sàng giao dịch"\n3. Phân tích kịch bản và tính Lot tại "Phân tích thị trường"\n4. Nhập lệnh thủ công bằng nút [+ Thêm Lệnh] hoặc Nhập MT5 / CSV\n5. Theo dõi kỷ luật ma trận 4 nhóm lệnh tại Dashboard.'
                          );
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition-colors text-left cursor-pointer"
                      >
                        <span className="text-sm">{item.emoji}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#1b2e25] text-[#00e676] font-semibold shadow-xs border-l-2 border-[#00e676]'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                      }`}
                    >
                      <span className="text-sm">{item.emoji}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Area: Sync status, Account Badge, Support, Brand note */}
        <div className="p-3 border-t border-[#27292d] space-y-3 bg-[#151718]">
          <SubscriptionBanner />
          {/* Sync indicator */}
          <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-[#00e676]">
            <span>Đã lưu ✓</span>
          </div>

          {/* Quick Account Box */}
          <Link
            href="/settings"
            prefetch={true}
            className="block p-2.5 rounded-lg bg-[#202225] border border-[#2d3034] hover:border-[#00e676]/40 transition-colors cursor-pointer"
          >
            <div className="text-xs font-bold text-white truncate">
              {activeAccountName}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              {tradeCount} lenh
            </div>
          </Link>

          {/* Support button */}
          <button
            type="button"
            onClick={() => {
              window.open('https://t.me/phamduydinh', '_blank');
            }}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border border-[#2d3034] bg-[#1a1c1e] text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <MessageSquare className="size-3.5 text-zinc-400" />
            <span>Liên hệ hỗ trợ</span>
          </button>

          {/* Brand copyright & links */}
          <div className="pt-2 text-center border-t border-[#27292d]/60 space-y-1">
            <div className="text-xs font-bold text-[#00e676] tracking-tight">
              FxBook
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Trading Journal © 2026
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500">
              <a href="#gioi-thieu" className="hover:underline">Giới thiệu</a>
              <span>·</span>
              <a href="#bao-mat" className="hover:underline">Bảo mật</a>
              <span>·</span>
              <a href="#dieu-khoan" className="hover:underline">Điều khoản</a>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
