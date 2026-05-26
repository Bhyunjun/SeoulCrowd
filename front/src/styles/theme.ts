// src/styles/theme.ts
// SeoulCrowdMap 디자인 토큰
// 모든 페이지에서 import 해서 사용하세요.
// 예: import { colors, typography, spacing, shadow, radius } from "../styles/theme";

export const colors = {
  // ─── Brand ─────────────────────────────────
  brand: {
    primary: "#0f172a",      // slate-900 (메인 다크)
    primaryHover: "#1e293b", // slate-800
    accent: "#2563eb",       // blue-600 (액센트, 링크)
    accentHover: "#1d4ed8",  // blue-700
  },

  // ─── Background ────────────────────────────
  bg: {
    base: "#ffffff",         // 카드, 모달 배경
    subtle: "#f8fafc",       // 페이지 배경
    muted: "#f1f5f9",        // 비활성 영역
    overlay: "rgba(255, 255, 255, 0.85)", // 지도 위 floating UI
  },

  // ─── Text ──────────────────────────────────
  text: {
    primary: "#0f172a",      // 제목, 본문 강조
    secondary: "#475569",    // 본문
    tertiary: "#94a3b8",     // 보조 텍스트
    inverse: "#ffffff",      // 어두운 배경 위 텍스트
  },

  // ─── Border ────────────────────────────────
  border: {
    light: "#e2e8f0",
    medium: "#cbd5e1",
  },

  // ─── Congestion (혼잡도 4단계) ──────────────
  congestion: {
    relaxed: {
      bg: "#10b981",         // 여유 - emerald-500
      bgSoft: "#d1fae5",     // emerald-100
      text: "#065f46",       // emerald-800
    },
    normal: {
      bg: "#f59e0b",         // 보통 - amber-500
      bgSoft: "#fef3c7",     // amber-100
      text: "#92400e",       // amber-800
    },
    busy: {
      bg: "#fb923c",         // 약간 붐빔 - orange-400
      bgSoft: "#ffedd5",     // orange-100
      text: "#9a3412",       // orange-800
    },
    crowded: {
      bg: "#dc2626",         // 붐빔 - red-600
      bgSoft: "#fee2e2",     // red-100
      text: "#991b1b",       // red-800
    },
    unknown: {
      bg: "#94a3b8",         // 확인 중 - slate-400
      bgSoft: "#f1f5f9",     // slate-100
      text: "#475569",       // slate-600
    },
  },

  // ─── Icon ──────────────────────────────────
  icon: {
    star: "#f5c518",         // 별 아이콘 채움 (이모지 ⭐과 동일한 골든 톤)
  },
} as const;

// 혼잡도 태그(문자열) → 색상 매핑 헬퍼
export const congestionByTag = (tag: string) => {
  if (tag.includes("약간")) return colors.congestion.busy;
  if (tag.includes("붐빔")) return colors.congestion.crowded;
  if (tag.includes("보통")) return colors.congestion.normal;
  if (tag.includes("여유")) return colors.congestion.relaxed;
  return colors.congestion.unknown;
};

// ─── Typography ──────────────────────────────
export const typography = {
  fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif",
  size: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 22,
    "2xl": 28,
    "3xl": 36,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

// ─── Spacing (px 단위) ───────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

// ─── Radius ──────────────────────────────────
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  "2xl": 28,
  full: 9999,
} as const;

// ─── Shadow (그림자 — 채도 낮춤) ─────────────
export const shadow = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.05)",
  md: "0 4px 12px rgba(15, 23, 42, 0.08)",
  lg: "0 10px 30px rgba(15, 23, 42, 0.10)",
  xl: "0 20px 50px rgba(15, 23, 42, 0.12)",
  // floating UI (지도 위 카드 등) 전용
  floating: "0 4px 16px rgba(15, 23, 42, 0.10), 0 2px 4px rgba(15, 23, 42, 0.06)",
} as const;

// ─── Transition ──────────────────────────────
export const transition = {
  fast: "0.15s ease-out",
  base: "0.2s ease-out",
  slow: "0.35s ease-out",
} as const;
