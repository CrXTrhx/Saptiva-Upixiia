type CardProps = {
  children: React.ReactNode;
  className?: string;
  /** Si la card es clickable/enlazable, activa el lift sutil al hover. */
  interactive?: boolean;
};

export function Card({ children, className = "", interactive = false }: CardProps) {
  // Lift solo cuando la card es interactiva; las estáticas quedan intactas.
  const motion = interactive
    ? "transition duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-md"
    : "";

  return (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm ${motion} ${className}`}
      style={{
        backdropFilter: "blur(20px)",
      }}
    >
      {children}
    </div>
  );
}
