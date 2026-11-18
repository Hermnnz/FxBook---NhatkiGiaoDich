'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DeferredDashboardSectionProps {
  children: ReactNode;
  minHeight?: number;
}

export function DeferredDashboardSection({
  children,
  minHeight = 360,
}: DeferredDashboardSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || visible) return;

    if (typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: '1200px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={containerRef} style={visible ? undefined : { minHeight }}>
      {visible ? children : (
        <div
          className="animate-pulse rounded-xl border border-[#26282c] bg-[#18191c]"
          style={{ minHeight }}
          aria-label="Đang chuẩn bị biểu đồ"
        />
      )}
    </div>
  );
}
