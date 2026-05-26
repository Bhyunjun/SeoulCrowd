import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { apiUrl, apiFetch, getAccessToken } from "../api/client";
import { isDesignReviewMode, mockHistoryResponse } from "../utils/designReviewMock";
import { AppLayout } from "../components/AppLayout";
import { colors, typography, spacing, radius, shadow, congestionByTag } from "../styles/theme";

type HistoryPoint = {
  updatedAt: string;       // "2026-04-20 08:30"
  populationMax: number;
  populationMin: number;
  congestionLevel: string;
};

type PlacePayload = {
  name: string;
  tag: string;
  population?: string;
  populationRange?: string;
  populationMaxRaw?: number;
  address?: string;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const formatTime = (d: Date) =>
  d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

// 한국어 라벨 + congestionByTag 색상 매핑. "약간 붐빔"이 "붐빔"으로 잘못 매칭되지 않도록 약간 먼저 체크.
const statusFromTag = (tag: string) => {
  const t = congestionByTag(tag);
  if (tag.includes("약간")) return { label: "주의", chip: "주의", color: t.text, bg: t.bgSoft };
  if (tag.includes("붐빔")) return { label: "혼잡", chip: "혼잡", color: t.text, bg: t.bgSoft };
  if (tag.includes("여유")) return { label: "원활", chip: "원활", color: t.text, bg: t.bgSoft };
  return { label: "확인 중", chip: "확인 중", color: t.text, bg: t.bgSoft };
};

const estimateCrowdPercent = (populationMaxRaw?: number) => {
  if (typeof populationMaxRaw !== "number") return null;
  return clamp(Math.round((populationMaxRaw / 50000) * 100), 1, 100);
};

function makeTrendPoints(seedPercent: number) {
  // 0~23시: 단순 곡선 (디자인용, 실제 데이터 연동 시 교체)
  const pts: { x: number; y: number }[] = [];
  for (let h = 0; h <= 23; h += 1) {
    const t = h / 23;
    const eveningBump = Math.exp(-Math.pow((t - 0.72) / 0.12, 2));
    const noonBump = Math.exp(-Math.pow((t - 0.55) / 0.18, 2)) * 0.6;
    const base = 0.25 + seedPercent / 140;
    const y = clamp(base + 0.55 * eveningBump + 0.25 * noonBump, 0.06, 0.98);
    pts.push({ x: h, y });
  }
  return pts;
}

function TrendMiniChart({ percent, historyData }: {
  percent: number;
  historyData?: HistoryPoint[];
}) {
  const points = useMemo(() => {
    if (historyData && historyData.length > 0) {
      const valid = historyData.filter(d => typeof d.updatedAt === "string" && d.updatedAt.includes(" "));
      if (valid.length === 0) return makeTrendPoints(percent);

      const hourMap = new Map<number, number[]>();
      valid.forEach(d => {
        const h = parseInt(d.updatedAt.split(" ")[1].split(":")[0], 10) || 0;
        if (!hourMap.has(h)) hourMap.set(h, []);
        hourMap.get(h)!.push(d.populationMax);
      });
      const known = Array.from(hourMap.entries())
        .map(([h, vals]) => ({ h, v: vals.reduce((a, b) => a + b, 0) / vals.length }))
        .sort((a, b) => a.h - b.h);

      const maxPop = Math.max(...known.map(p => p.v)) || 1;

      return Array.from({ length: 24 }, (_, h) => {
        const exact = known.find(k => k.h === h);
        if (exact) return { x: h, y: clamp(exact.v / maxPop, 0.06, 0.98) };

        const prev = [...known].reverse().find(k => k.h < h);
        const next = known.find(k => k.h > h);
        if (prev && next) {
          const t = (h - prev.h) / (next.h - prev.h);
          return { x: h, y: clamp((prev.v + t * (next.v - prev.v)) / maxPop, 0.06, 0.98) };
        }
        return { x: h, y: clamp((prev ?? next)!.v / maxPop, 0.06, 0.98) };
      });
    }
    return makeTrendPoints(percent);
  }, [percent, historyData]);

  const w = 520;
  const h = 170;
  const pad = 18;
  const toX = (hour: number) => pad + (hour / 23) * (w - pad * 2);
  const toY = (y: number) => pad + (1 - y) * (h - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(" ");

  const nowHour = new Date().getHours();
  const closestIdx = points.reduce((bestIdx, p, i) =>
    Math.abs(p.x - nowHour) < Math.abs(points[bestIdx].x - nowHour) ? i : bestIdx
  , 0);
  const currentPoint = points[closestIdx];

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={d} fill="none" stroke={colors.brand.accent} strokeWidth="3" strokeLinecap="round" filter="url(#glow)" opacity="0.6" />
      <circle cx={toX(currentPoint.x)} cy={toY(currentPoint.y)} r="5" fill={colors.brand.accent} />
    </svg>
  );
}

// Phase 2 결정 필요: 다크 팔레트는 theme.ts에 없어 hex 유지. 다크 모드를 정식 지원할지 결정.
const DARK_PALETTE = {
  bg: "#0b1a2a",
  surface: "rgba(255,255,255,0.06)",
  surface2: "rgba(255,255,255,0.08)",
  text: "#e9f2fb",
  sub: "rgba(233,242,251,0.70)",
  border: "rgba(255,255,255,0.10)",
};

const LIGHT_PALETTE = {
  bg: colors.bg.subtle,
  surface: colors.bg.base,
  surface2: colors.bg.base,
  text: colors.text.primary,
  sub: colors.text.secondary,
  border: colors.border.light,
};

export default function PlaceReportPage() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const statePlace = (location.state as { place?: PlacePayload } | null)?.place ?? null;
  const placeNameFromUrl = params.placeName ? decodeURIComponent(params.placeName) : null;

  const [place, setPlace] = useState<PlacePayload | null>(
    statePlace ?? (placeNameFromUrl ? { name: placeNameFromUrl, tag: "정보 불러오는 중" } : null),
  );
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(statePlace ? new Date() : null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);

  useEffect(() => {
  if (!place?.name) return;
  if (isDesignReviewMode()) {
    setHistoryData(mockHistoryResponse(place.name).data);
    return;
  }
  fetch(apiUrl(`/api/population/${encodeURIComponent(place.name)}/history`))
    .then(r => r.json())
    .then(json => {
      if (Array.isArray(json?.data)) setHistoryData(json.data);
    })
    .catch(() => {});
  }, [place?.name]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch("/api/favorites")
      .then((r) => r.json())
      .then((j) => setFavoriteNames(Array.isArray(j?.favorites) ? j.favorites : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!place) return;
    if (statePlace?.populationMaxRaw != null) return;
    fetchPopulation()
      .then((list) => {
        const found = list.find((x) => x.areaName === place.name);
        if (!found) return;
        setPlace((prev) =>
          prev
            ? {
                ...prev,
                tag: found.congestionLevel ?? prev.tag,
                populationMaxRaw: typeof found.populationMax === "number" ? found.populationMax : prev.populationMaxRaw,
                population: typeof found.populationMax === "number" ? `${(found.populationMax / 10000).toFixed(1)}만` : prev.population,
                populationRange:
                  typeof found.populationMin === "number" && typeof found.populationMax === "number"
                    ? `${(found.populationMin / 10000).toFixed(1)}만 ~ ${(found.populationMax / 10000).toFixed(1)}만`
                    : prev.populationRange,
              }
            : prev,
        );
        setLastUpdatedAt(new Date());
      })
      .catch(() => {});
  }, [place, statePlace?.populationMaxRaw, statePlace?.populationRange, statePlace?.population]);

  const isBookmarked = place ? favoriteNames.includes(place.name) : false;

  const reloadFavorites = async () => {
    const token = getAccessToken();
    if (!token) {
      setFavoriteNames([]);
      return;
    }
    const res = await apiFetch("/api/favorites");
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success && Array.isArray(json?.favorites)) {
      setFavoriteNames(json.favorites);
    }
  };

  const toggleFavorite = async () => {
    if (!place) return;
    const token = getAccessToken();
    if (!token) {
      alert("즐겨찾기는 로그인 후 사용할 수 있습니다.");
      return;
    }
    if (favoriteBusy) return;
    try {
      setFavoriteBusy(true);
      const res = isBookmarked
        ? await apiFetch(`/api/favorites/${encodeURIComponent(place.name)}`, { method: "DELETE" })
        : await apiFetch("/api/favorites", {
            method: "POST",
            body: JSON.stringify({ placeName: place.name }),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (res.status === 400 && typeof json?.message === "string" && json.message.includes("이미")) {
          await reloadFavorites();
          return;
        }
        throw new Error(json?.message ?? "즐겨찾기 처리에 실패했습니다.");
      }
      if (Array.isArray(json?.favorites)) {
        setFavoriteNames(json.favorites);
      } else {
        await reloadFavorites();
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "즐겨찾기 처리에 실패했습니다.");
      await reloadFavorites();
    } finally {
      setFavoriteBusy(false);
    }
  };

  const peakHour = useMemo(() => {
    const valid = historyData.filter(d => typeof d.updatedAt === "string" && d.updatedAt.includes(" "));
    if (!valid.length) return "오후 7:00";
    const peak = valid.reduce((a, b) => a.populationMax > b.populationMax ? a : b);
    return peak.updatedAt.split(" ")[1];
  }, [historyData]);

  const quietHour = useMemo(() => {
    const valid = historyData.filter(d => typeof d.updatedAt === "string" && d.updatedAt.includes(" "));
    if (!valid.length) return "오전 4:00";
    const quiet = valid.reduce((a, b) => a.populationMax < b.populationMax ? a : b);
    return quiet.updatedAt.split(" ")[1];
  }, [historyData]);

  if (!place) {
    return (
      <AppLayout>
        <div style={s.wrap}>
          <div style={s.card}>장소 정보가 없습니다.</div>
        </div>
      </AppLayout>
    );
  }

  const crowdPercent = estimateCrowdPercent(place.populationMaxRaw) ?? 42;
  const st = statusFromTag(place.tag);
  const updatedLabel = lastUpdatedAt ? `${formatTime(lastUpdatedAt)} 기준` : "--:-- 기준";

  const isDark = theme === "dark";
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  return (
    <AppLayout>
      <div style={{ ...s.wrap, background: palette.bg, color: palette.text }}>
        <div style={s.shell}>
          <div style={s.topRow}>
            <button type="button" onClick={() => navigate(-1)} style={{ ...s.backBtn, background: "transparent", color: palette.text }}>
              ←
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.titleRow}>
                <div style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {place.name}
                </div>
                <button
                  type="button"
                  onClick={toggleFavorite}
                  style={{ ...s.starBtn, background: "transparent", opacity: favoriteBusy ? 0.6 : 1, color: palette.text }}
                  aria-label="즐겨찾기"
                  title="즐겨찾기"
                >
                  {isBookmarked ? "★" : "☆"}
                </button>
              </div>
              <div style={{
                fontSize: typography.size.sm,
                color: palette.sub,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {place.address ?? "서울, 대한민국"}
              </div>
            </div>
            <button type="button" style={{ ...s.smallBtn, background: "transparent", color: palette.text }}>공유</button>
          </div>

          <div style={s.grid}>
            <div style={{ ...s.panel, background: palette.surface, borderColor: palette.border }}>
              <div style={s.panelHeader}>
                <div>
                  <div style={s.panelTitle}>24시간 인구 추이</div>
                  <div style={{ fontSize: typography.size.xs, color: palette.sub }}>● 실시간 업데이트</div>
                </div>
                <button type="button" style={{ ...s.toggleBtn, background: palette.surface2, borderColor: palette.border, color: palette.text }}>
                  어제와 비교
                </button>
              </div>
              <div style={{ paddingTop: 6 }}>
                <TrendMiniChart percent={crowdPercent} historyData={historyData} />
              </div>
              <div style={s.axisRow}>
                {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "23:59"].map((t) => (
                  <div key={t} style={{ fontSize: 10, color: palette.sub }}>{t}</div>
                ))}
              </div>

              <div style={s.bottomCards}>
                <div style={{ ...s.smallCard, background: palette.surface2, borderColor: palette.border }}>
                  <div style={s.smallCardTitle}>피크 시간</div>
                  <div style={s.smallCardValue}>{peakHour}</div>
                  <div style={s.smallCardSub}>붐비는 시간대</div>
                </div>
                <div style={{ ...s.smallCard, background: palette.surface2, borderColor: palette.border }}>
                  <div style={s.smallCardTitle}>한산한 시간</div>
                  <div style={s.smallCardValue}>{quietHour}</div>
                  <div style={s.smallCardSub}>가장 여유로움</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing.md + 2 }}>
              <div style={{ ...s.panel, background: palette.surface, borderColor: palette.border }}>
                <div style={s.statusHeader}>
                  <div style={{
                    fontSize: typography.size.xs,
                    letterSpacing: "0.12em",
                    color: palette.sub,
                    fontWeight: typography.weight.bold,
                  }}>현재 상태</div>
                  <div style={{ fontSize: typography.size.xs, color: palette.sub }}>{updatedLabel}</div>
                </div>
                <div style={{ ...s.chip, background: st.bg, color: st.color }}>
                  <span style={{ ...s.chipDot, background: st.color }} />
                  {st.chip}
                </div>

                <div style={s.statStack}>
                  <div style={{ ...s.statBox, background: palette.surface2, borderColor: palette.border }}>
                    <div style={s.statLabel}>추정 인구</div>
                    <div style={s.statBig}>{place.population ?? "-"}</div>
                  </div>
                  <div style={{ ...s.statBox, background: palette.surface2, borderColor: palette.border }}>
                    <div style={s.statLabel}>인구 범위</div>
                    <div style={s.statBig}>{place.populationRange ?? "-"}</div>
                  </div>
                </div>
              </div>

              <div style={{ ...s.aiPanel, borderColor: palette.border }}>
                <div style={{ fontWeight: typography.weight.bold, fontSize: typography.size.base }}>혼잡도 AI 인사이트</div>
                <div style={{ fontSize: typography.size.sm, opacity: 0.9, lineHeight: 1.4, marginTop: spacing.sm }}>
                  현재 혼잡 비율은 약 <b>{crowdPercent}%</b>로 추정됩니다. 저녁 시간대로 갈수록 사람이 늘어날 가능성이 있어요.
                </div>
                <button type="button" style={s.aiBtn}>상세 예측 보기</button>
              </div>

              <button
                type="button"
                onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
                style={{ ...s.themeBtn, background: palette.surface, borderColor: palette.border, color: palette.text }}
              >
                테마 전환
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    padding: spacing.lg + 2,
  },
  shell: { width: "min(1100px, 100%)" },
  topRow: { display: "flex", alignItems: "center", gap: spacing.md, marginBottom: spacing.md + 2 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    fontSize: 18,
  },
  smallBtn: {
    height: 36,
    padding: `0 ${spacing.md + 2}px`,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm + 2 },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  grid: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: spacing.md + 2, alignItems: "start" },
  panel: {
    borderRadius: radius.lg + 4,
    border: "1px solid",
    padding: spacing.lg,
    boxShadow: shadow.sm,
  },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm + 2, marginBottom: spacing.sm + 2 },
  panelTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold },
  toggleBtn: {
    height: 30,
    padding: `0 ${spacing.md}px`,
    borderRadius: radius.full,
    border: "1px solid",
    cursor: "pointer",
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  axisRow: { display: "flex", justifyContent: "space-between", marginTop: spacing.sm },
  bottomCards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing.md, marginTop: spacing.md },
  smallCard: { borderRadius: radius.lg + 2, border: "1px solid", padding: spacing.md + 2 },
  smallCardTitle: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, opacity: 0.8, marginBottom: spacing.xs + 2 },
  smallCardValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  smallCardSub: { fontSize: typography.size.xs, opacity: 0.75, marginTop: spacing.xs },
  statusHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm + 2 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.full,
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  chipDot: { width: 8, height: 8, borderRadius: radius.full },
  statStack: { display: "grid", gridTemplateColumns: "1fr", gap: spacing.sm + 2 },
  statBox: { borderRadius: radius.lg + 2, border: "1px solid", padding: spacing.md },
  statLabel: { fontSize: typography.size.xs, opacity: 0.8, fontWeight: typography.weight.bold, marginBottom: spacing.xs + 2 },
  statBig: { fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  aiPanel: {
    borderRadius: radius.lg + 4,
    border: "1px solid",
    padding: spacing.lg,
    background: colors.brand.accent,
    color: colors.text.inverse,
  },
  aiBtn: {
    width: "100%",
    marginTop: spacing.md,
    height: 36,
    borderRadius: radius.md + 2,
    border: "none",
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    background: colors.bg.base,
    color: colors.brand.accent,
    fontFamily: "inherit",
  },
  themeBtn: {
    height: 36,
    borderRadius: radius.full,
    border: "1px solid",
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    fontFamily: "inherit",
  },
  card: { padding: spacing.lg + 2, borderRadius: radius.lg + 2, background: colors.bg.base, color: colors.text.primary },
};
