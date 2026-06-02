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

// 머신러닝 예측 서비스(FastAPI) 주소. 기본 localhost:8000.
// 배포 시 front/.env(.local) 에 VITE_ML_API_URL 지정.
const ML_API_BASE =
  (import.meta.env.VITE_ML_API_URL as string | undefined) ?? "http://localhost:8000";

// 로컬 날짜 → "YYYY-MM-DD" (브라우저 타임존 기준)
const toDateInput = (d: Date) => {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

type DailyPoint = {
  hour: number;
  label: string;
  predictedMax: number;
  predictedMin: number;
  congestionLevel: string;
  confidence: "high" | "medium" | "low";
};

const formatPopKo = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}만명` : `${Math.round(n).toLocaleString("ko-KR")}명`;

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

  // ── 상세 ML 예측 (날짜별 24시간 곡선) ──
  const [showPrediction, setShowPrediction] = useState(false);
  const [predDate, setPredDate] = useState<string>(() => toDateInput(new Date()));
  const [predHour, setPredHour] = useState<number>(() => new Date().getHours());
  const [dailyPoints, setDailyPoints] = useState<DailyPoint[]>([]);
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [predMeta, setPredMeta] = useState<{ method?: string; dayOfWeek?: string } | null>(null);

  useEffect(() => {
    if (!showPrediction || !place?.name) return;
    let cancelled = false;
    setPredLoading(true);
    setPredError(null);
    fetch(`${ML_API_BASE}/api/forecast/${encodeURIComponent(place.name)}/daily?date=${predDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`예측 서버 응답 오류 (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json?.success || !Array.isArray(json?.points)) throw new Error("예측 데이터를 받지 못했습니다.");
        setDailyPoints(json.points);
        setPredMeta({ method: json.method, dayOfWeek: json.dayOfWeek });
      })
      .catch((e) => {
        if (cancelled) return;
        setDailyPoints([]);
        setPredError(
          e instanceof Error && e.message.includes("Failed to fetch")
            ? "예측 서버에 연결할 수 없습니다. (ml-prediction 서버를 실행하세요: uvicorn server:app --port 8000)"
            : e instanceof Error ? e.message : "예측을 불러오지 못했습니다.",
        );
      })
      .finally(() => !cancelled && setPredLoading(false));
    return () => { cancelled = true; };
  }, [showPrediction, place?.name, predDate]);

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
                <button
                  type="button"
                  style={s.aiBtn}
                  onClick={() => setShowPrediction((v) => !v)}
                >
                  {showPrediction ? "예측 닫기" : "상세 예측 보기"}
                </button>
              </div>
            </div>
          </div>

          {showPrediction && (
            <PredictionPanel
              points={dailyPoints}
              loading={predLoading}
              error={predError}
              date={predDate}
              onDateChange={setPredDate}
              hour={predHour}
              onHourChange={setPredHour}
              meta={predMeta}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── 상세 ML 예측 패널: 날짜 입력 + 24시간 예측 곡선 + 선택 시각 예측 인구 ──
function PredictionPanel({
  points, loading, error, date, onDateChange, hour, onHourChange, meta,
}: {
  points: DailyPoint[];
  loading: boolean;
  error: string | null;
  date: string;
  onDateChange: (d: string) => void;
  hour: number;
  onHourChange: (h: number) => void;
  meta: { method?: string; dayOfWeek?: string } | null;
}) {
  const peak = points.length
    ? points.reduce((a, b) => (a.predictedMax > b.predictedMax ? a : b))
    : null;
  const selected = points.find((p) => p.hour === hour) ?? null;
  const confLabel: Record<string, string> = { high: "높음", medium: "보통", low: "낮음" };

  return (
    <div style={{ ...s.panel, marginTop: spacing.md + 2 }}>
      <div style={s.panelHeader}>
        <div>
          <div style={s.panelTitle}>📈 머신러닝 예측 (날짜별 인구)</div>
          <div style={s.panelSub}>
            <span style={s.panelDot} />
            LightGBM 모델 · 장소·시각·요일 학습
          </div>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          style={s.dateInput}
        />
      </div>

      {loading && <div style={s.predNote}>예측을 불러오는 중…</div>}
      {error && <div style={{ ...s.predNote, color: "#e5484d" }}>{error}</div>}

      {!loading && !error && points.length > 0 && (
        <>
          <div style={s.predSummaryRow}>
            <div style={s.predSummaryCard}>
              <div style={s.statLabel}>예측 피크</div>
              <div style={s.statBig}>{peak ? formatPopKo(peak.predictedMax) : "-"}</div>
              <div style={s.smallCardSub}>{peak ? `${peak.label} · ${peak.congestionLevel}` : ""}</div>
            </div>
            <div style={s.predSummaryCard}>
              <div style={s.statLabel}>
                선택 시각&nbsp;
                <select
                  value={hour}
                  onChange={(e) => onHourChange(Number(e.target.value))}
                  style={s.hourSelect}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </div>
              <div style={s.statBig}>{selected ? formatPopKo(selected.predictedMax) : "-"}</div>
              <div style={s.smallCardSub}>
                {selected
                  ? `${formatPopKo(selected.predictedMin)} ~ ${formatPopKo(selected.predictedMax)} · ${selected.congestionLevel}`
                  : ""}
              </div>
            </div>
          </div>

          <PredictionCurve points={points} selectedHour={hour} />

          <div style={s.predNote}>
            {meta?.dayOfWeek ? `${date} (${meta.dayOfWeek}요일) ` : `${date} `}
            예측 · 신뢰도 {confLabel[points[0].confidence] ?? "낮음"}
            {points[0].confidence === "low" && " (데이터가 더 쌓이면 정확도가 올라갑니다)"}
          </div>
        </>
      )}

      {!loading && !error && points.length === 0 && (
        <div style={s.predNote}>해당 날짜의 예측 데이터가 없습니다.</div>
      )}
    </div>
  );
}

// 24시간 예측 곡선 (predictedMax). 선택 시각을 강조.
function PredictionCurve({ points, selectedHour }: { points: DailyPoint[]; selectedHour: number }) {
  const w = 720;
  const h = 200;
  const pad = 24;
  const maxV = Math.max(...points.map((p) => p.predictedMax), 1);
  const toX = (hour: number) => pad + (hour / 23) * (w - pad * 2);
  const toY = (v: number) => pad + (1 - v / maxV) * (h - pad * 2);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.hour).toFixed(1)} ${toY(p.predictedMax).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${toX(23).toFixed(1)} ${h - pad} L ${toX(0).toFixed(1)} ${h - pad} Z`;
  const sel = points.find((p) => p.hour === selectedHour);

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", marginTop: spacing.md }}>
      <defs>
        <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.brand.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colors.brand.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#predFill)" stroke="none" />
      <path d={line} fill="none" stroke={colors.brand.accent} strokeWidth="2.5" strokeLinecap="round" />
      {[0, 6, 12, 18, 23].map((hh) => (
        <text key={hh} x={toX(hh)} y={h - 6} fontSize="10" fill={colors.text.secondary} textAnchor="middle">
          {String(hh).padStart(2, "0")}시
        </text>
      ))}
      {sel && (
        <>
          <line x1={toX(sel.hour)} y1={pad} x2={toX(sel.hour)} y2={h - pad}
            stroke={colors.brand.accent} strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          <circle cx={toX(sel.hour)} cy={toY(sel.predictedMax)} r="5" fill={colors.brand.accent} />
        </>
      )}
    </svg>
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
  dateInput: {
    height: 34,
    padding: `0 ${spacing.sm + 2}px`,
    borderRadius: radius.md + 2,
    border: `1px solid ${colors.border.light}`,
    background: colors.bg.base,
    color: colors.text.primary,
    fontFamily: "inherit",
    fontSize: typography.size.sm,
    cursor: "pointer",
  },
  predSummaryRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing.md, marginTop: spacing.sm },
  predSummaryCard: {
    borderRadius: radius.lg + 2,
    border: `1px solid ${colors.border.light}`,
    padding: spacing.md + 2,
    background: colors.bg.subtle,
  },
  hourSelect: {
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.md,
    background: colors.bg.base,
    color: colors.text.primary,
    fontFamily: "inherit",
    fontSize: typography.size.xs,
    padding: "2px 4px",
    cursor: "pointer",
  },
  predNote: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.text.secondary,
    lineHeight: 1.5,
  },
};
