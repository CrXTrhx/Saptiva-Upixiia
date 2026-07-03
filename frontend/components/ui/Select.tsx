"use client";

// Select custom (patrón APG "select-only combobox") — reemplaza al <select>
// nativo porque el panel de opciones del nativo lo pinta el sistema operativo
// y no acepta CSS. Aquí el panel sigue el sistema visual (tokens de
// globals.css + motion de DESIGN.md) y el trigger se estiliza por contexto
// vía className/style, igual que se estilizaba el <select>.
//
// - El panel se renderiza en un portal (document.body) con position: fixed,
//   así no lo recortan los `overflow` de los modales ni crea problemas de
//   stacking; se reposiciona en scroll/resize y hace flip si no cabe abajo.
// - Teclado equivalente al nativo: ↑/↓, Home/End, Enter/Espacio, Escape,
//   typeahead por texto. Foco permanece en el trigger (aria-activedescendant).
// - `dot` opcional por opción: punto de color a la izquierda (p. ej. estados).

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { DUR, EASE_OUT } from "@/lib/motion";

export type SelectOption = {
  value: string;
  label: string;
  /** Punto de color opcional a la izquierda de la opción (y del trigger). */
  dot?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Texto del trigger cuando value === "" (sin selección). */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Clases del trigger — pásale las mismas que llevaba el <select>. */
  className?: string;
  /** Estilo inline del trigger (para los modales que estilizan con style). */
  style?: CSSProperties;
};

const TYPEAHEAD_RESET_MS = 500;

// Store inerte para useSyncExternalStore: solo distingue servidor de cliente.
const subscribeNoop = () => () => {};

export function Select({
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  ariaLabel,
  disabled = false,
  className = "",
  style,
}: SelectProps) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const reduceMotion = useReducedMotion();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{ query: string; at: number }>({ query: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // El portal solo puede montarse en cliente (document.body no existe en SSR):
  // `mounted` es false en servidor/hidratación y true ya en cliente. Además,
  // AnimatePresence debe vivir DENTRO del portal (no al revés) para que
  // rastree el enter/exit del panel correctamente.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // value === "" significa "sin selección": el trigger muestra el placeholder
  // aunque exista una opción "" en la lista (esa opción es la de "limpiar").
  const selected =
    value === "" ? null : (options.find((o) => o.value === value) ?? null);
  const optionId = (i: number) => `${id}-opt-${i}`;

  // --- Posicionamiento: fixed junto al trigger, flip vertical y clamp
  // horizontal si no cabe. Corre antes del paint (useLayoutEffect) y en cada
  // scroll/resize mientras esté abierto.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    panel.style.minWidth = `${r.width}px`;
    panel.style.maxHeight = `${Math.min(320, vh - 16)}px`;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const below = vh - r.bottom;
    const openUp = below < ph + 12 && r.top > below;
    const top = openUp
      ? Math.max(8, r.top - 6 - ph)
      : Math.min(vh - 8 - ph, r.bottom + 6);
    const left = Math.max(8, Math.min(r.left, vw - 8 - pw));
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.transformOrigin = openUp ? "bottom left" : "top left";
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Cierre al hacer pointer-down fuera del trigger y del panel.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Mantiene visible la opción resaltada al navegar con teclado.
  useEffect(() => {
    if (!open || highlight < 0) return;
    document
      .getElementById(optionId(highlight))
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlight]);

  const firstEnabled = useCallback(
    (from: number, dir: 1 | -1): number => {
      for (
        let i = from;
        i >= 0 && i < options.length;
        i += dir
      ) {
        if (!options[i].disabled) return i;
      }
      return -1;
    },
    [options],
  );

  const openPanel = useCallback(() => {
    if (disabled) return;
    const selectedIdx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(selectedIdx >= 0 ? selectedIdx : firstEnabled(0, 1));
    setOpen(true);
  }, [disabled, options, value, firstEnabled]);

  const select = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  function moveHighlight(dir: 1 | -1) {
    const start = highlight < 0 ? (dir === 1 ? 0 : options.length - 1) : highlight + dir;
    const next = firstEnabled(start, dir);
    if (next >= 0) setHighlight(next);
  }

  function typeahead(char: string) {
    const now = Date.now();
    const prev = typeaheadRef.current;
    const query =
      now - prev.at < TYPEAHEAD_RESET_MS ? prev.query + char : char;
    typeaheadRef.current = { query, at: now };
    const q = query.toLowerCase();
    const idx = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(q),
    );
    if (idx >= 0) {
      if (open) setHighlight(idx);
      else select(options[idx]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openPanel();
      } else if (e.key.length === 1 && e.key !== " ") {
        typeahead(e.key);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        // Escape cierra solo el dropdown (la capa más interna), no el modal
        // que pueda contenerlo (ui/Modal escucha Escape a nivel documento).
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        e.preventDefault();
        setHighlight(firstEnabled(0, 1));
        break;
      case "End":
        e.preventDefault();
        setHighlight(firstEnabled(options.length - 1, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlight >= 0) select(options[highlight]);
        break;
      default:
        if (e.key.length === 1) typeahead(e.key);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && highlight >= 0 ? optionId(highlight) : undefined
        }
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
        className={`flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed ${className}`}
        // Mientras el panel está abierto, el borde toma el acento (feedback
        // claro de qué combo está activo). Sobrescribe el borde del caller.
        style={open ? { ...style, borderColor: "var(--color-accent)" } : style}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.dot && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selected.dot }}
              aria-hidden="true"
            />
          )}
          <span className={`truncate ${selected ? "font-medium" : ""}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 transition-[transform,color] duration-150"
          style={{
            color: open ? "var(--color-accent)" : "var(--color-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
              ref={panelRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed z-[70] overflow-y-auto overscroll-contain rounded-xl p-1.5"
              style={{
                top: 0,
                left: 0,
                width: "max-content",
                maxWidth: "min(340px, calc(100vw - 16px))",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                // Sombra en dos capas: contacto sutil + elevación difusa.
                boxShadow:
                  "0 1px 2px rgba(48, 47, 45, 0.06), 0 12px 32px rgba(48, 47, 45, 0.14)",
                // Scrollbar discreta cuando la lista excede la altura máxima.
                scrollbarWidth: "thin",
                scrollbarColor: "var(--color-border) transparent",
              }}
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }
              }
              transition={{ duration: DUR.overlay, ease: EASE_OUT }}
            >
              <ul className="flex flex-col gap-0.5">
                {options.length === 0 && (
                  <li
                    className="px-3 py-2.5 text-sm"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Sin opciones disponibles
                  </li>
                )}
                {options.map((opt, i) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = i === highlight;
                  // Separador sutil bajo la opción de "limpiar" (value "") para
                  // distinguirla de las opciones reales del filtro.
                  const conSeparador =
                    i === 0 && opt.value === "" && options.length > 1;
                  return (
                    <Fragment key={opt.value || "__empty__"}>
                      <li
                        id={optionId(i)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled || undefined}
                        onPointerEnter={() => !opt.disabled && setHighlight(i)}
                        onClick={() => select(opt)}
                        className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                          opt.disabled
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }`}
                        style={{
                          backgroundColor: isHighlighted
                            ? "var(--color-bg-hover)"
                            : isSelected
                              ? "var(--color-accent-light)"
                              : "transparent",
                          color: isSelected
                            ? "var(--color-text)"
                            : "var(--color-text-secondary)",
                          fontWeight: isSelected ? 500 : 400,
                        }}
                      >
                        {opt.dot && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: opt.dot }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        <Check
                          size={14}
                          strokeWidth={2.25}
                          aria-hidden="true"
                          className="shrink-0"
                          style={{
                            color: "var(--color-accent)",
                            visibility: isSelected ? "visible" : "hidden",
                          }}
                        />
                      </li>
                      {conSeparador && (
                        <li
                          aria-hidden="true"
                          role="presentation"
                          className="mx-2 my-1 h-px"
                          style={{ backgroundColor: "var(--color-border-inner)" }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </ul>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
