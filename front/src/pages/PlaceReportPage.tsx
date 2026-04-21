import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";

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

const getAccessToken = () => sessionStorage.getItem("accessToken");
const authFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const formatTime = (d: Date) =>
  d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

const statusFromTag = (tag: string) => {
  if (tag.includes("붐빔")) return { label: "혼잡", chip: "혼잡", color: "#f44336", bg: "#fdecea" };
  if (tag.includes("약간")) return { label: "주의", chip: "주의", color: "#ff9800", bg: "#fff3e0" };
  if (tag.includes("여유")) return { label: "원활", chip: "원활", color: "#4caf50", bg: "#e8f5e9" };
  return { label: "확인 중", chip: "확인 중", color: "#90aac0", bg: "#eef4f8" };
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

      // 시간별 populationMax 평균
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

      // 0~23 전체 보간
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

  // 현재 시각과 가장 가까운 포인트
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
      <path d={d} fill="none" stroke="#64b5f6" strokeWidth="3" strokeLinecap="round" filter="url(#glow)" />
      <circle cx={toX(currentPoint.x)} cy={toY(currentPoint.y)} r="5" fill="#2196f3" />
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
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);

  useEffect(() => {
  if (!place?.name) return;
  fetch(`/api/population/${encodeURIComponent(place.name)}/history`)
    .then(r => r.json())
    .then(json => {
      if (Array.isArray(json?.data)) setHistoryData(json.data);
    })
    .catch(() => {});
  }, [place?.name]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    authFetch("/api/favorites")
      .then((r) => r.json())
      .then((j) => setFavoriteNames(Array.isArray(j?.favorites) ? j.favorites : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!place) return;
    if (statePlace?.populationMaxRaw != null) return;
    // state 없이 직접 진입 시 최소 데이터 보강 (15분 캐시)
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
    const res = await authFetch("/api/favorites");
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
        ? await authFetch(`/api/favorites/${encodeURIComponent(place.name)}`, { method: "DELETE" })
        : await authFetch("/api/favorites", {
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
      <div style={s.wrap}>
        <div style={s.card}>장소 정보가 없습니다.</div>
      </div>
    );
  }

  const crowdPercent = estimateCrowdPercent(place.populationMaxRaw) ?? 42;




  const st = statusFromTag(place.tag);
  const updatedLabel = lastUpdatedAt ? `${formatTime(lastUpdatedAt)} 기준` : "--:-- 기준";

  const isDark = theme === "dark";
  const palette = isDark
    ? {
        bg: "#0b1a2a",
        surface: "rgba(255,255,255,0.06)",
        surface2: "rgba(255,255,255,0.08)",
        text: "#e9f2fb",
        sub: "rgba(233,242,251,0.70)",
        border: "rgba(255,255,255,0.10)",
      }
    : {
        bg: "#eaf6ff",
        surface: "rgba(255,255,255,0.86)",
        surface2: "rgba(255,255,255,0.95)",
        text: "#17324a",
        sub: "#6d8aa2",
        border: "rgba(30,80,120,0.08)",
      };

  return (
    <div style={{ ...s.wrap, background: palette.bg, color: palette.text }}>
      <div style={s.shell}>
        <div style={s.topRow}>
          <button type="button" onClick={() => navigate(-1)} style={{ ...s.backBtn, background: palette.surface }}>
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.titleRow}>
              <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {place.name}
              </div>
              <button
                type="button"
                onClick={toggleFavorite}
                style={{ ...s.starBtn, background: palette.surface, opacity: favoriteBusy ? 0.6 : 1 }}
                aria-label="즐겨찾기"
                title="즐겨찾기"
              >
                {isBookmarked ? "★" : "☆"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: palette.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {place.address ?? "서울, 대한민국"}
            </div>
          </div>
          <button type="button" style={{ ...s.smallBtn, background: palette.surface }}>공유</button>
        </div>

        <div style={s.grid}>
          <div style={{ ...s.panel, background: palette.surface, borderColor: palette.border }}>
            <div style={s.panelHeader}>
              <div>
                <div style={s.panelTitle}>24시간 인구 추이</div>
                <div style={{ fontSize: 11, color: palette.sub }}>● 실시간 업데이트</div>
              </div>
              <button type="button" style={{ ...s.toggleBtn, background: palette.surface2, borderColor: palette.border }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...s.panel, background: palette.surface, borderColor: palette.border }}>
              <div style={s.statusHeader}>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", color: palette.sub, fontWeight: 800 }}>현재 상태</div>
                <div style={{ fontSize: 11, color: palette.sub }}>{updatedLabel}</div>
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
              <div style={{ fontWeight: 900, fontSize: 14 }}>혼잡도 AI 인사이트</div>
              <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4, marginTop: 8 }}>
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
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: 18, fontFamily: "'Noto Sans KR', sans-serif" },
  shell: { width: "min(1100px, 100%)" },
  topRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: { width: 36, height: 36, borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 900 },
  smallBtn: { height: 36, padding: "0 14px", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 800 },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  starBtn: { width: 36, height: 36, borderRadius: 999, border: "none", cursor: "pointer", fontSize: 18, fontWeight: 900 },
  grid: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, alignItems: "start" },
  panel: { borderRadius: 18, border: "1px solid", padding: 16 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  panelTitle: { fontSize: 14, fontWeight: 900 },
  toggleBtn: { height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid", cursor: "pointer", fontSize: 11, fontWeight: 800 },
  axisRow: { display: "flex", justifyContent: "space-between", marginTop: 8 },
  bottomCards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 },
  smallCard: { borderRadius: 16, border: "1px solid", padding: 14 },
  smallCardTitle: { fontSize: 11, fontWeight: 900, opacity: 0.8, marginBottom: 6 },
  smallCardValue: { fontSize: 18, fontWeight: 900 },
  smallCardSub: { fontSize: 11, opacity: 0.75, marginTop: 4 },
  statusHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chip: { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "6px 12px", fontWeight: 900, fontSize: 12, marginBottom: 12 },
  chipDot: { width: 8, height: 8, borderRadius: "50%" },
  statStack: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  statBox: { borderRadius: 16, border: "1px solid", padding: 12 },
  statLabel: { fontSize: 11, opacity: 0.8, fontWeight: 800, marginBottom: 6 },
  statBig: { fontSize: 18, fontWeight: 900 },
  aiPanel: {
    borderRadius: 18,
    border: "1px solid",
    padding: 16,
    background: "linear-gradient(135deg, #1aa6d6, #0f7fb8)",
    color: "white",
  },
  aiBtn: { width: "100%", marginTop: 12, height: 36, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 900 },
  themeBtn: { height: 36, borderRadius: 999, border: "1px solid", cursor: "pointer", fontWeight: 900 },
  card: { padding: 18, borderRadius: 16, background: "white" },
};

