type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm ${className}`}
      style={{
        backdropFilter: "blur(20px)",
      }}
    >
      {children}
    </div>
  );
}
