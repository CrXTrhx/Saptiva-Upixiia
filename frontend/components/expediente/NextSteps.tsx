"use client";

import type { NextStep, PrioridadNextStep } from "@/lib/types";

type NextStepsProps = {
  steps: NextStep[];
};

const dotColor: Record<PrioridadNextStep, string> = {
  alta: "var(--color-accent)",
  media: "var(--color-amber)",
  baja: "var(--color-slate-dot)",
};

const chipStyle: Record<PrioridadNextStep, { bg: string; text: string }> = {
  alta: { bg: "var(--color-accent-light)", text: "var(--color-accent-text-dark)" },
  media: { bg: "var(--color-amber-bg)", text: "var(--color-amber-text)" },
  baja: { bg: "var(--color-slate-bg)", text: "var(--color-slate-text)" },
};

export default function NextSteps({ steps }: NextStepsProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-tertiary)" }}
      >
        Próximos pasos
      </h3>

      {steps.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Sin pendientes
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {steps.map((step) => {
            const chip = chipStyle[step.prioridad];
            return (
              <li key={step.id} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor[step.prioridad] }}
                />
                <span
                  className="text-sm flex-1"
                  style={{ color: "var(--color-text)" }}
                >
                  {step.texto}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                  style={{ backgroundColor: chip.bg, color: chip.text }}
                >
                  {step.prioridad}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
