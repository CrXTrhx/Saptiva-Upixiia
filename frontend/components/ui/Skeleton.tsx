// Placeholder de carga con shimmer. Usa la utilidad `.skeleton` de globals.css
// (respeta prefers-reduced-motion automáticamente). Ver DESIGN.md › Motion.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
