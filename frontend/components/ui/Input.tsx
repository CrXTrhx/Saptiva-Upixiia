"use client";

import { type InputHTMLAttributes, useState } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  togglePassword?: boolean;
};

export function Input({
  label,
  error,
  togglePassword = false,
  id,
  type = "text",
  className = "",
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const resolvedType = togglePassword && showPassword ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-[var(--color-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={resolvedType}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`w-full rounded-lg border bg-[var(--color-surface)] px-3.5 py-2.5 text-base sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-[color,border-color,box-shadow] duration-150 ease-out focus:outline-none ${
            error
              ? "border-red-400 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(214,69,69,0.15)]"
              : "border-[var(--color-border)] hover:border-[var(--color-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-ring)]"
          } ${togglePassword ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {togglePassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
