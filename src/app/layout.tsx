import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeInitializer } from '@/components/layout/theme-initializer';
import { JournalBoundary } from '@/components/layout/journal-boundary';

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FxBook — Nhật Ký Giao Dịch",
  description:
    "Nhật ký giao dịch tài chính chuyên nghiệp. Theo dõi, phân tích và cải thiện hiệu suất giao dịch.",
  icons: {
    icon: [
      { url: "/icon.png?v=2", type: "image/png" },
      { url: "/favicon.ico?v=2", sizes: "any" },
    ],
    apple: "/apple-icon.png?v=2",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        suppressHydrationWarning
      >
        <ThemeInitializer />
        <JournalBoundary>{children}</JournalBoundary>
      </body>
    </html>
  );
}
