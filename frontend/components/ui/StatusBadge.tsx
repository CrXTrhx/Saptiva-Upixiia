import type { Estado } from "@/lib/types";
import { statusColorMap } from "@/lib/status";

export function StatusBadge({ estado }: { estado: Estado }) {
  const c = statusColorMap[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: c.dot }}
        aria-hidden="true"
      />
      {c.label}
    </span>
  );
}
