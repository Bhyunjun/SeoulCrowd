/* eslint-disable react-refresh/only-export-components */
// 검토 모드 전체 로직을 한 파일에 모으기 위해 컴포넌트 + 상수/함수 동시 export 허용.
// src/utils/designReviewMock.tsx
// ⚠️ 디자인 검토 전용 — 발표 빌드에서는 VITE_DESIGN_REVIEW_MODE=false 또는 미설정.
// 이 파일을 삭제하고 다른 파일의 `isDesignReviewMode()` 분기만 지우면 완전 복구된다.

import type { CSSProperties } from "react";
import type { ApiPopulationRaw } from "./populationCache";

// ─── Flag ───────────────────────────────────────────────────────────────────
export const isDesignReviewMode = () =>
  (import.meta.env.VITE_DESIGN_REVIEW_MODE as string | undefined) === "true";

// ─── Mock token (apiFetch Authorization 헤더 등에서 사용) ────────────────────
export const MOCK_ACCESS_TOKEN = "design-review-mode-fake-token";

// ─── Mock population (10곳 · 혼잡도 3·3·2·2 분포) ───────────────────────────
export const MOCK_POPULATION: ApiPopulationRaw[] = [
  { areaName: "강남역",       congestionLevel: "붐빔",      populationMin: 50000, populationMax: 58000, latitude: 37.4979, longitude: 127.0276 },
  { areaName: "명동",         congestionLevel: "붐빔",      populationMin: 42000, populationMax: 50000, latitude: 37.5636, longitude: 126.9826 },
  { areaName: "홍대입구역",   congestionLevel: "붐빔",      populationMin: 38000, populationMax: 45000, latitude: 37.5572, longitude: 126.9254 },
  { areaName: "잠실",         congestionLevel: "약간 붐빔", populationMin: 28000, populationMax: 34000, latitude: 37.5133, longitude: 127.1000 },
  { areaName: "광화문",       congestionLevel: "약간 붐빔", populationMin: 24000, populationMax: 30000, latitude: 37.5759, longitude: 126.9769 },
  { areaName: "코엑스",       congestionLevel: "약간 붐빔", populationMin: 22000, populationMax: 27000, latitude: 37.5126, longitude: 127.0590 },
  { areaName: "이태원",       congestionLevel: "보통",      populationMin: 15000, populationMax: 19000, latitude: 37.5345, longitude: 126.9947 },
  { areaName: "여의도",       congestionLevel: "보통",      populationMin: 13000, populationMax: 17000, latitude: 37.5219, longitude: 126.9245 },
  { areaName: "성수카페거리", congestionLevel: "여유",      populationMin: 6000,  populationMax: 9000,  latitude: 37.5447, longitude: 127.0557 },
  { areaName: "서울숲",       congestionLevel: "여유",      populationMin: 4500,  populationMax: 6500,  latitude: 37.5443, longitude: 127.0374 },
];

// ─── Mock favorites (모듈 메모리 — 새로고침 시 초기값으로 리셋) ──────────────
let mockFavorites: string[] = ["강남역", "홍대입구역", "성수카페거리"];

// ─── Helpers ────────────────────────────────────────────────────────────────
const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ─── apiFetch 대체 ──────────────────────────────────────────────────────────
export const mockApiFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const method = (init?.method ?? "GET").toUpperCase();

  if (input === "/api/auth/me" && method === "GET") {
    return jsonResponse({
      success: true,
      user: { id: "mock-user", email: "review@example.com", name: "디자인 검토자" },
    });
  }

  if (input === "/api/favorites" && method === "GET") {
    return jsonResponse({ success: true, favorites: [...mockFavorites] });
  }

  if (input === "/api/favorites" && method === "POST") {
    try {
      const body = init?.body ? (JSON.parse(init.body as string) as { placeName?: string }) : {};
      const name = body.placeName;
      if (name && !mockFavorites.includes(name)) {
        mockFavorites = [...mockFavorites, name];
      }
      return jsonResponse({ success: true, favorites: [...mockFavorites] });
    } catch {
      return jsonResponse({ success: false, message: "잘못된 요청 본문" }, 400);
    }
  }

  if (input.startsWith("/api/favorites/") && method === "DELETE") {
    const name = decodeURIComponent(input.replace("/api/favorites/", ""));
    mockFavorites = mockFavorites.filter((n) => n !== name);
    return jsonResponse({ success: true, favorites: [...mockFavorites] });
  }

  return jsonResponse(
    { success: false, message: `mock: 미지원 엔드포인트 ${method} ${input}` },
    404,
  );
};

// ─── 랭킹 모킹 (RankingPage가 직접 fetch) ───────────────────────────────────
type RankingItem = {
  areaName: string;
  congestionLevel?: string;
  populationMin?: number;
  populationMax?: number;
};
export const mockRankingResponse = (): { crowded: RankingItem[]; quiet: RankingItem[] } => {
  const pick = (p: ApiPopulationRaw): RankingItem => ({
    areaName: p.areaName,
    congestionLevel: p.congestionLevel,
    populationMin: p.populationMin,
    populationMax: p.populationMax,
  });
  const sorted = [...MOCK_POPULATION].sort((a, b) => b.populationMax - a.populationMax);
  return {
    crowded: sorted.slice(0, 5).map(pick),
    quiet: sorted.slice(-5).reverse().map(pick),
  };
};

// ─── 히스토리 모킹 (PlaceReportPage가 직접 fetch) ────────────────────────────
type HistoryPoint = {
  updatedAt: string;
  populationMax: number;
  populationMin: number;
  congestionLevel: string;
};
export const mockHistoryResponse = (placeName: string): { data: HistoryPoint[] } => {
  const found = MOCK_POPULATION.find((p) => p.areaName === placeName);
  const peak = found?.populationMax ?? 20000;
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const seed = placeName.length;
  const data: HistoryPoint[] = [];
  for (let h = 0; h < 24; h += 1) {
    const t = h / 23;
    const eveningBump = Math.exp(-Math.pow((t - 0.72) / 0.12, 2));
    const noonBump = Math.exp(-Math.pow((t - 0.55) / 0.18, 2)) * 0.6;
    const base = 0.20 + (seed % 5) * 0.05;
    const factor = base + 0.55 * eveningBump + 0.30 * noonBump;
    const max = Math.round(peak * Math.max(0.08, Math.min(1, factor)));
    const min = Math.round(max * 0.75);
    const level =
      max > 40000 ? "붐빔" : max > 25000 ? "약간 붐빔" : max > 12000 ? "보통" : "여유";
    data.push({
      updatedAt: `${dateStr} ${pad(h)}:00`,
      populationMax: max,
      populationMin: min,
      congestionLevel: level,
    });
  }
  return { data };
};

// ─── 빨간 배너 (플래그 off면 null) ──────────────────────────────────────────
export function DesignReviewBanner() {
  if (!isDesignReviewMode()) return null;
  return (
    <div style={bannerStyle} role="alert" aria-label="design review mode banner">
      🚧 DESIGN REVIEW MODE — 발표 빌드 금지 (VITE_DESIGN_REVIEW_MODE=false 로 변경)
    </div>
  );
}

const bannerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#dc2626",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.02em",
  zIndex: 99999,
  pointerEvents: "none",
  boxShadow: "0 2px 8px rgba(220, 38, 38, 0.4)",
};
