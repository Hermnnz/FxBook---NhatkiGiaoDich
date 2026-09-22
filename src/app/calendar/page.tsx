'use client';

import { useEffect, useRef, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { useJournalData } from '@/contexts/journal-context';
import { ExternalLink, Info } from 'lucide-react';

export default function CalendarPage() {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { accounts } = useJournalData();

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    target.replaceChildren();

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    script.async = true;
    script.type = 'text/javascript';
    script.textContent = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: 750,
      locale: 'vi',
      importanceFilter: '-1,0,1',
    });
    script.onerror = () => setFailed(true);

    target.append(widget, script);
    const timer = window.setTimeout(() => {
      if (!target.querySelector('iframe')) setFailed(true);
    }, 12_000);

    return () => {
      window.clearTimeout(timer);
      target.replaceChildren();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-5">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Lịch kinh tế
            </h1>
            <p className="text-xs text-zinc-400">
              Các sự kiện, tin tức kinh tế quan trọng ảnh hưởng tới thị trường
            </p>
          </div>

          {/* Info Banner matching Lichkinhte.png */}
          <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs text-blue-300 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              Dữ liệu được tải trực tiếp từ TradingView theo thời gian thực — cần kết nối Internet để hiển thị.
            </span>
          </div>

          {/* Widget Container */}
          <section className="p-4 rounded-xl border border-[#27292d] bg-[#1a1c1e]">
            {failed && (
              <p className="mb-3 text-sm text-amber-400">
                Không tải được widget trong trình duyệt này. Bạn có thể xem trực tiếp tại TradingView.
              </p>
            )}
            <div ref={container} className="tradingview-widget-container min-h-[750px] w-full overflow-hidden" />
            <div className="mt-3 text-right">
              <a
                href="https://www.tradingview.com/economic-calendar/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#00e676] hover:underline"
              >
                <span>Mở lịch trên TradingView</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          </section>

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />
    </div>
  );
}
