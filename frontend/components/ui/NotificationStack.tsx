"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X, AlertTriangle, Info, Bell } from "lucide-react";
import { DUR, EASE_OUT } from "@/lib/motion";
import type { TonoEvento } from "@/lib/types";

export type Notif = {
  id: string;
  tono: TonoEvento;
  titulo: string;
  descripcion?: string;
};

// Mismos colores de tono que el timeline del historial (identidad gráfica).
const tonoColor: Record<TonoEvento, string> = {
  ok: "#8FA585",
  warn: "#D88A6A",
  accent: "#F19B42",
  neutral: "#B5AFA9",
};

const tonoIcon: Record<TonoEvento, typeof Check> = {
  ok: Check,
  warn: AlertTriangle,
  accent: Bell,
  neutral: Info,
};

const AUTO_DISMISS_MS = 4500;

/**
 * Centro de notificaciones emergentes estilo macOS: tarjetas apiladas arriba-derecha
 * que aparecen unos segundos y se desvanecen. El hover pausa el auto-cierre.
 */
export function NotificationStack({
  notifs,
  onDismiss,
}: {
  notifs: Notif[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[340px] max-w-[90vw] pointer-events-none">
      <AnimatePresence initial={false}>
        {notifs.map((n) => (
          <NotifCard key={n.id} notif={n} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotifCard({
  notif,
  onDismiss,
}: {
  notif: Notif;
  onDismiss: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = tonoIcon[notif.tono];

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onDismiss(notif.id), AUTO_DISMISS_MS);
  };
  const disarm = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    arm();
    return disarm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notif.id]);

  return (
    <motion.div
      layout
      className="pointer-events-auto flex items-start gap-2.5 rounded-xl bg-white px-3.5 py-3"
      style={{
        border: "1px solid #E5DED6",
        boxShadow: "0 8px 24px rgba(48,47,45,0.12)",
      }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: DUR.entrance, ease: EASE_OUT }}
      onMouseEnter={disarm}
      onMouseLeave={arm}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: tonoColor[notif.tono] + "22" }}
      >
        <Icon size={12} strokeWidth={2.25} style={{ color: tonoColor[notif.tono] }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-tight" style={{ color: "#302F2D" }}>
          {notif.titulo}
        </p>
        {notif.descripcion && (
          <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "#5C5957" }}>
            {notif.descripcion}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(notif.id)}
        className="shrink-0 rounded-md p-0.5 transition-colors cursor-pointer"
        style={{ color: "#B5AFA9" }}
        aria-label="Cerrar notificación"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </motion.div>
  );
}
