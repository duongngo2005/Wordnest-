"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-container wn-page">
      <section className="wn-surface wn-stack-tight p-[var(--space-m)]" role="alert">
        <h1 className="wn-section-heading">Không kết nối được máy chủ WordNest</h1>
        <p className="text-[var(--step--1)] text-[var(--ink-2)]">Kiểm tra mạng hoặc Tailscale rồi thử lại.</p>
        <button type="button" onClick={reset} className="wn-button wn-button-primary w-fit">Thử lại</button>
      </section>
    </main>
  );
}
