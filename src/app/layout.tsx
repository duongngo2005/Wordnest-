import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-story-display",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-story-serif",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

import { PwaRegister } from "@/components/pwa/PwaRegister";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "WordNest — Thêm từ, học và ôn tập.",
  description:
    "Ứng dụng học từ vựng tiếng Anh cá nhân với flashcard, ôn tập ngắt quãng và luyện nhớ chủ động.",
  applicationName: "WordNest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WordNest",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF6EE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-[#FAF6EE] text-[#221C16]"
        suppressHydrationWarning
      >
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
