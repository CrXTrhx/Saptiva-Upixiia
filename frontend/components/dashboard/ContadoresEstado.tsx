"use client";

import type { ConteoEstados, Estado } from "@/lib/types";
import { statusColorMap, STATUS_DISPLAY_ORDER } from "@/lib/status";

const ICONS: Record<Estado, React.ReactNode> = {
  INCOMPLETE_EXPIRED: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/></svg>
  ),
  IN_VALIDATION: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  RECEIVING: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
  ),
  CAPTURING: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  ),
  COMPLETE: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  CANCELLED: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  ARCHIVED: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
  ),
};

function SkeletonCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="skeleton h-3 w-10 mb-3" />
          <div className="skeleton h-7 w-12 mb-2" />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ContadoresEstado({
  conteos,
  loading,
}: {
  conteos: ConteoEstados | null;
  loading: boolean;
}) {
  if (loading || !conteos) return <SkeletonCards />;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {STATUS_DISPLAY_ORDER.map((estado) => {
        const c = statusColorMap[estado];
        return (
          <div
            key={estado}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: c.dot }}
                aria-hidden="true"
              />
              <span style={{ color: c.dot }}>{ICONS[estado]}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)] leading-tight">
              {conteos[estado]}
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {c.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
