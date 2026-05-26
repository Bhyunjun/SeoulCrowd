import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";  // PlaceCard 내부에서 사용
import { Star } from "lucide-react";
import { fetchPopulation } from "../utils/populationCache";
import { apiFetch, getAccessToken } from "../api/client";
import { AppLayout } from "../components/AppLayout";
import { colors, typography, spacing, radius, shadow, congestionByTag } from "../styles/theme";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Place {
  name: string;
  tag: string;
  tagColor: string;     // chip text color (congestionByTag.text)
  tagBg: string;        // chip background (congestionByTag.bgSoft)
  population: string;
  updatedAt: string;
  bookmarked: boolean;
}

type PopulationItem = {
  areaName: string;
  congestionLevel: string;
  populationMin?: number;
  populationMax?: number;
};

const getErrorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const formatTime = (d: Date) =>
  d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

// ─── Component ────────────────────────────────────────────────────────────────
export default function FavoritesPage() {
  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [populationMap, setPopulationMap] = useState<Map<string, PopulationItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const places: Place[] = useMemo(() => {
    const updatedLabel = lastUpdatedAt ? `업데이트 ${formatTime(lastUpdatedAt)}` : "업데이트 --:--";
    return favoriteNames.map((name) => {
      const info = populationMap.get(name);
      const congestionLevel = info?.congestionLevel ?? "정보 없음";
      const tagToken = congestionByTag(congestionLevel);

      const min = info?.populationMin;
      const max = info?.populationMax;
      const avg = typeof min === "number" && typeof max === "number" ? Math.round((min + max) / 2) : null;
      const populationText = avg !== null ? `${(avg / 10000).toFixed(1)}만` : "-";

      return {
        name,
        tag: congestionLevel,
        tagColor: tagToken.text,
        tagBg: tagToken.bgSoft,
        population: populationText,
        updatedAt: updatedLabel,
        bookmarked: true,
      };
    });
  }, [favoriteNames, populationMap, lastUpdatedAt]);

  const loadFavorites = async () => {
    const token = getAccessToken();
    if (!token) {
      setError("로그인이 필요합니다. 먼저 로그인 해주세요.");
      setFavoriteNames([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [favRes, list] = await Promise.all([
        apiFetch("/api/favorites"),
        fetchPopulation(),
      ]);

      if (!favRes.ok) {
        const msg = await favRes.json().catch(() => null);
        throw new Error(msg?.message ?? "즐겨찾기 목록을 불러오지 못했습니다.");
      }

      const favJson = await favRes.json();

      const names: string[] = favJson.favorites ?? [];
      const map = new Map<string, PopulationItem>();
      list.forEach((p) => map.set(p.areaName, p));

      setFavoriteNames(names);
      setPopulationMap(map);
      setLastUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(getErrorMessage(e, "알 수 없는 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const removeFavorite = async (placeName: string) => {
    try {
      setError(null);
      const res = await apiFetch(`/api/favorites/${encodeURIComponent(placeName)}`, { method: "DELETE" });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? "즐겨찾기 삭제에 실패했습니다.");
      }
      setFavoriteNames(Array.isArray(json?.favorites) ? json.favorites : []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "알 수 없는 오류가 발생했습니다."));
    }
  };

  return (
    <AppLayout>
      {/* Top bar */}
      <div style={s.topBar}>
        <div style={s.logoRow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.brand.accent} strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span style={s.logoText}>SEOUL Favorites</span>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <p style={s.headerSub}>REAL-TIME DASHBOARD</p>
            <h1 style={s.headerTitle}>즐겨찾는 장소</h1>
          </div>
        </div>

        {/* Loading / Error / Empty 상태는 grid 밖에서 풀폭으로 표시 */}
        {loading && <div style={{ ...s.notice, marginTop: 0 }}>즐겨찾기 불러오는 중...</div>}
        {!loading && error && <div style={{ ...s.notice, marginTop: 0 }}>{error}</div>}
        {!loading && !error && places.length === 0 && (
          <div style={{ ...s.notice, marginTop: 0 }}>즐겨찾기한 장소가 없습니다.</div>
        )}

        {/* Cards grid (실제 데이터 있을 때만) */}
        {!loading && !error && places.length > 0 && (
          <div style={s.cardsRow}>
            {places.map((place) => (
              <PlaceCard key={place.name} place={place} onBookmark={() => removeFavorite(place.name)} />
            ))}
          </div>
        )}

        {/* Bottom notice */}
        <div style={s.notice}>
          <span style={s.noticeDot} />
          서울의 인구 밀도를 데이터로 지금 바로 파악하고 있습니다
        </div>
      </div>
    </AppLayout>
  );
}

// ─── PlaceCard ────────────────────────────────────────────────────────────────
function PlaceCard({ place, onBookmark }: { place: Place; onBookmark: () => void }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      style={{
        ...s.card,
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? shadow.lg : shadow.md,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() =>
        navigate(`/report/${encodeURIComponent(place.name)}`, {
          state: { place: { name: place.name, tag: place.tag, population: place.population, populationRange: undefined } },
        })
      }
      role="button"
      tabIndex={0}
    >
      {/* Card top — 즐겨찾기 토글 버튼만 (장식 별은 제거됨) */}
      <div style={s.cardTop}>
        <button
          style={s.starBtn}
          onClick={(e) => {
            e.stopPropagation();
            onBookmark();
          }}
          aria-label="즐겨찾기 해제"
        >
          <Star
            size={18}
            fill={place.bookmarked ? colors.icon.star : "none"}
            color={place.bookmarked ? colors.icon.star : colors.border.medium}
            strokeWidth={2}
          />
        </button>
      </div>

      <h3 style={s.cardName}>{place.name}</h3>
      <p style={s.cardAddress}>내 즐겨찾기</p>

      {/* Divider */}
      <div style={s.cardDivider} />

      {/* Stats */}
      <div style={s.cardStats}>
        <div>
          <p style={s.statLabel}>현재 인구</p>
          <div style={s.statRow}>
            <span style={{ ...s.tagChip, background: place.tagBg, color: place.tagColor }}>
              {place.tag}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={place.tagColor} strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p style={s.popValue}>{place.population}</p>
        </div>
      </div>

      <p style={s.updatedAt}>{place.updatedAt}</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.lg}px ${spacing.xl + 4}px`,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
  },
  logoText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    letterSpacing: "0.03em",
  },
  main: {
    flex: 1,
    padding: `0 ${spacing.xl + 4}px ${spacing.xl - 4}px`,
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: "0.15em",
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    margin: `0 0 ${spacing.xs}px`,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: "-0.8px",
    margin: 0,
  },
  // 카드가 많아져도 줄바꿈되어 세로로 쌓이도록 grid 사용 (auto-fill로 너비 적응)
  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: {
    background: colors.bg.base,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.xl + 2,
    padding: `${spacing.xl - 4}px ${spacing.lg + 2}px ${spacing.lg}px`,
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: spacing.md,
  },
  noticeDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    background: colors.brand.accent,
    display: "inline-block",
    flexShrink: 0,
  },
  starBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 2,
  },
  cardName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    margin: `0 0 ${spacing.xs}px`,
    letterSpacing: "-0.3px",
  },
  cardAddress: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    margin: 0,
  },
  cardDivider: {
    height: 1,
    background: colors.border.light,
    margin: `${spacing.md + 2}px 0`,
  },
  cardStats: {
    display: "flex",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    margin: `0 0 ${spacing.xs + 2}px`,
    letterSpacing: "0.03em",
  },
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  tagChip: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    borderRadius: radius.sm + 2,
    padding: "3px 8px",
  },
  popValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    margin: `${spacing.xs}px 0 0`,
    letterSpacing: "-0.3px",
  },
  updatedAt: {
    fontSize: 10,
    color: colors.text.tertiary,
    margin: `${spacing.sm + 2}px 0 0`,
  },
  notice: {
    marginTop: spacing.xl,
    background: colors.bg.muted,
    borderRadius: radius.lg + 2,
    padding: `${spacing.sm + 2}px ${spacing.lg + 2}px`,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    display: "inline-flex",
    alignItems: "center",
    gap: spacing.sm,
    boxShadow: shadow.sm,
  },
};
