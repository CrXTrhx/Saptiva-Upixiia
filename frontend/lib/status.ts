import type { Estado } from "./types";

export type StatusColor = {
  dot: string;
  bg: string;
  text: string;
  label: string;
  icon: string;
};

export const statusColorMap: Record<Estado, StatusColor> = {
  INCOMPLETE_EXPIRED: {
    dot: "#DC2626",
    bg: "#FEE2E2",
    text: "#991B1B",
    label: "Vencido",
    icon: "alert-triangle",
  },
  IN_VALIDATION: {
    dot: "#D97706",
    bg: "#FEF3C7",
    text: "#92400E",
    label: "Validación",
    icon: "mail",
  },
  RECEIVING: {
    dot: "#7C3AED",
    bg: "#EDE9FE",
    text: "#5B21B6",
    label: "Recepción",
    icon: "zap",
  },
  CAPTURING: {
    dot: "#2563EB",
    bg: "#DBEAFE",
    text: "#1E40AF",
    label: "Captura",
    icon: "edit",
  },
  COMPLETE: {
    dot: "#16A34A",
    bg: "#DCFCE7",
    text: "#166534",
    label: "Completo",
    icon: "check-circle",
  },
  CANCELLED: {
    dot: "#989396",
    bg: "#F3F3F3",
    text: "#525252",
    label: "Cancelado",
    icon: "x",
  },
  ARCHIVED: {
    dot: "#C4C0C4",
    bg: "#F9F9F9",
    text: "#737373",
    label: "Archivado",
    icon: "archive",
  },
};

export const STATUS_DISPLAY_ORDER: Estado[] = [
  "INCOMPLETE_EXPIRED",
  "IN_VALIDATION",
  "RECEIVING",
  "CAPTURING",
  "COMPLETE",
  "CANCELLED",
  "ARCHIVED",
];
