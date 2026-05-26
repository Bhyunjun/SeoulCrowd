import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { apiUrl, apiFetch, getAccessToken } from "../api/client";
import { isDesignReviewMode, mockHistoryResponse } from "../utils/designReviewMock";
import { AppLayout } from "../components/AppLayout";
import { ChevronLeft, Star } from "lucide-react";
import { colors, typography, spacing, radius, shadow } from "../styles/theme";
import { statusForReport } from "../utils/congestionStatus";

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
  const st = statusForReport(place.tag);
  const updatedLabel = lastUpdatedAt ? `${formatTime(lastUpdatedAt)} 기준` : "--:-- 기준";

  return (
    <AppLayout>
      <div style={s.wrap}>
        <div style={s.shell}>
          <div style={s.topRow}>
            <button type="button" onClick={() => navigate(-1)} style={s.backBtn} aria-label="뒤로가기">
              <ChevronLeft size={20} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.titleRow}>
                <div style={s.titleText}>
                  {place.name}
                </div>
                <button
                  type="button"
                  onClick={toggleFavorite}
                  style={{ ...s.starBtn, opacity: favoriteBusy ? 0.6 : 1 }}
                  aria-label="즐겨찾기"
                  title="즐겨찾기"
                >
                  <Star
                    size={18}
                    fill={isBookmarked ? colors.icon.star : "none"}
                    color={isBookmarked ? colors.icon.star : colors.text.primary}
                    strokeWidth={2}
                  />
                </button>
              </div>
              <div style={s.addressText}>
                {place.address ?? "서울, 대한민국"}
              </div>
            </div>
            <button type="button" style={s.smallBtn}>공유</button>
          </div>

          <div className="report-grid">
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <div>
                  <div style={s.panelTitle}>24시간 인구 추이</div>
                  <div style={s.panelSub}>
                    <span style={s.panelDot} />
                    실시간 업데이트
                  </div>
                </div>
                <button type="button" style={s.toggleBtn}>
                  어제와 비교
                </button>
              </div>
              <div style={{ paddingTop: 6 }}>
                <TrendMiniChart percent={crowdPercent} historyData={historyData} />
              </div>
              <div style={s.axisRow}>
                {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "23:59"].map((t) => (
                  <div key={t} style={s.axisLabel}>{t}</div>
                ))}
              </div>

              <div style={s.bottomCards}>
                <div style={s.smallCard}>
                  <div style={s.smallCardTitle}>피크 시간</div>
                  <div style={s.smallCardValue}>{peakHour}</div>
                  <div style={s.smallCardSub}>붐비는 시간대</div>
                </div>
                <div style={s.smallCard}>
                  <div style={s.smallCardTitle}>한산한 시간</div>
                  <div style={s.smallCardValue}>{quietHour}</div>
                  <div style={s.smallCardSub}>가장 여유로움</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing.md + 2 }}>
              <div style={s.panel}>
                <div style={s.statusHeader}>
                  <div style={s.statusHeaderLabel}>현재 상태</div>
                  <div style={s.statusHeaderTime}>{updatedLabel}</div>
                </div>
                <div style={{ ...s.chip, background: st.bg, color: st.color }}>
                  <span style={{ ...s.chipDot, background: st.color }} />
                  {st.label}
                </div>

                <div style={s.statStack}>
                  <div style={s.statBox}>
                    <div style={s.statLabel}>추정 인구</div>
                    <div style={s.statBig}>{place.population ?? "-"}</div>
                  </div>
                  <div style={s.statBox}>
                    <div style={s.statLabel}>인구 범위</div>
                    <div style={s.statBig}>{place.populationRange ?? "-"}</div>
                  </div>
                </div>
              </div>

              <div style={s.aiPanel}>
                <div style={s.aiTitle}>혼잡도 AI 인사이트</div>
                <div style={s.aiBody}>
                  현재 혼잡 비율은 약 <b>{crowdPercent}%</b>로 추정됩니다. 저녁 시간대로 갈수록 사람이 늘어날 가능성이 있어요.
                </div>
                <button type="button" style={s.aiBtn}>상세 예측 보기</button>
              </div>
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
    background: colors.bg.subtle,
    color: colors.text.primary,
  },
  shell: { width: "min(1100px, 100%)" },
  topRow: { display: "flex", alignItems: "center", gap: spacing.md, marginBottom: spacing.md + 2 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: colors.text.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtn: {
    height: 36,
    padding: `0 ${spacing.md + 2}px`,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
    background: "transparent",
    color: colors.text.primary,
    fontFamily: "inherit",
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm + 2 },
  titleText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: colors.text.primary,
  },
  addressText: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    borderRadius: radius.lg + 4,
    border: `1px solid ${colors.border.light}`,
    padding: spacing.lg,
    boxShadow: shadow.sm,
    background: colors.bg.base,
  },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing.sm + 2, marginBottom: spacing.sm + 2 },
  panelTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  panelSub: {
    fontSize: typography.size.xs,
    color: colors.text.secondary,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  panelDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    background: colors.text.secondary,
    display: "inline-block",
  },
  toggleBtn: {
    height: 30,
    padding: `0 ${spacing.md}px`,
    borderRadius: radius.full,
    border: `1px solid ${colors.border.light}`,
    cursor: "pointer",
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    background: colors.bg.base,
    color: colors.text.primary,
    fontFamily: "inherit",
  },
  axisRow: { display: "flex", justifyContent: "space-between", marginTop: spacing.sm },
  axisLabel: { fontSize: 10, color: colors.text.secondary },
  bottomCards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing.md, marginTop: spacing.md },
  smallCard: {
    borderRadius: radius.lg + 2,
    border: `1px solid ${colors.border.light}`,
    padding: spacing.md + 2,
    background: colors.bg.base,
  },
  smallCardTitle: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.text.secondary, marginBottom: spacing.xs + 2 },
  smallCardValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text.primary },
  smallCardSub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: spacing.xs },
  statusHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm + 2 },
  statusHeaderLabel: {
    fontSize: typography.size.xs,
    letterSpacing: "0.12em",
    color: colors.text.secondary,
    fontWeight: typography.weight.bold,
  },
  statusHeaderTime: { fontSize: typography.size.xs, color: colors.text.secondary },
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
  statBox: {
    borderRadius: radius.lg + 2,
    border: `1px solid ${colors.border.light}`,
    padding: spacing.md,
    background: colors.bg.base,
  },
  statLabel: { fontSize: typography.size.xs, color: colors.text.secondary, fontWeight: typography.weight.bold, marginBottom: spacing.xs + 2 },
  statBig: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text.primary },
  aiPanel: {
    borderRadius: radius.lg + 4,
    border: `1px solid ${colors.border.light}`,
    padding: spacing.lg,
    background: colors.brand.accent,
    color: colors.text.inverse,
  },
  aiTitle: { fontWeight: typography.weight.bold, fontSize: typography.size.base },
  aiBody: { fontSize: typography.size.sm, opacity: 0.9, lineHeight: 1.4, marginTop: spacing.sm },
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
  card: { padding: spacing.lg + 2, borderRadius: radius.lg + 2, background: colors.bg.base, color: colors.text.primary },
};
