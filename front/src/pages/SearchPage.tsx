import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { AppLayout } from "../components/AppLayout";
import { colors, typography, spacing, radius, shadow, congestionByTag } from "../styles/theme";

type ApiPopulation = {
  areaName: string;
  congestionLevel: string;
  populationMin: number;
  populationMax: number;
  latitude: number;
  longitude: number;
};

type PlacePayload = {
  name: string;
  tag: string;
  population: string;
  populationRange: string;
  populationMaxRaw: number;
  address?: string;
};

const RECENT_KEY = "recentSearches";
const MAX_RECENT = 10;

const formatPop = (n: number | null | undefined) => {
  if (n == null) return "-";
  return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n.toLocaleString("ko-KR");
};

const getRecentSearches = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};

const addRecentSearch = (name: string) => {
  const prev = getRecentSearches().filter((n) => n !== name);
  localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...prev].slice(0, MAX_RECENT)));
};

export default function SearchPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<ApiPopulation[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await fetchPopulation();
        setPlaces(list);
      } catch (e) {
        const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaces();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return places.filter((p) => p.areaName.includes(q)).slice(0, 12);
  }, [places, query]);

  const recentPlaces = useMemo(() => {
    return recentSearches
      .map((name) => places.find((p) => p.areaName === name))
      .filter((p): p is ApiPopulation => p !== undefined);
  }, [recentSearches, places]);

  const handlePlaceClick = (p: ApiPopulation) => {
    addRecentSearch(p.areaName);
    setRecentSearches(getRecentSearches());
    const payload: PlacePayload = {
      name: p.areaName,
      tag: p.congestionLevel,
      population: formatPop(p.populationMax),
      populationRange: `${formatPop(p.populationMin)} ~ ${formatPop(p.populationMax)}`,
      populationMaxRaw: p.populationMax,
    };
    navigate(`/report/${encodeURIComponent(p.areaName)}`, { state: { place: payload } });
  };

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecentSearches([]);
  };

  const showRecent = query.trim() === "";

  return (
    <AppLayout>
      <div style={s.topBar}>
        <div style={s.titleWrap}>
          <div style={s.title}>장소 검색</div>
          <div style={s.subtitle}>이름을 입력하면 상세 리포트로 이동할 수 있어요.</div>
        </div>
      </div>

      <div style={s.searchWrap}>
        <input
          style={s.searchInput}
          placeholder="예: 양재역, 뚝섬역"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" style={s.clearBtn} onClick={() => setQuery("")}>
          지우기
        </button>
      </div>

      <div style={s.content}>
        {loading && <div style={s.stateText}>검색 데이터를 불러오는 중...</div>}

        {!loading && error && <div style={s.stateText}>{error}</div>}

        {!loading && !error && showRecent && (
          <>
            {recentPlaces.length === 0 ? (
              <div style={s.stateText}>최근 검색한 장소가 없습니다.</div>
            ) : (
              <>
                <div style={s.sectionHeader}>
                  <span style={s.sectionTitle}>최근 검색</span>
                  <button type="button" style={s.clearRecentBtn} onClick={clearRecent}>
                    전체 삭제
                  </button>
                </div>
                {recentPlaces.map((p) => (
                  <PlaceRow key={p.areaName} place={p} onClick={() => handlePlaceClick(p)} />
                ))}
              </>
            )}
          </>
        )}

        {!loading && !error && !showRecent && (
          <>
            {filtered.length === 0 ? (
              <div style={s.stateText}>검색 결과가 없습니다.</div>
            ) : (
              filtered.map((p) => (
                <PlaceRow key={p.areaName} place={p} onClick={() => handlePlaceClick(p)} />
              ))
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function PlaceRow({ place, onClick }: { place: ApiPopulation; onClick: () => void }) {
  const tagToken = congestionByTag(place.congestionLevel);
  return (
    <div
      style={s.resultItem}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div style={s.resultName}>{place.areaName}</div>
      <div style={s.resultMeta}>
        <span style={{ ...s.resultChip, color: tagToken.text, background: tagToken.bgSoft }}>
          {place.congestionLevel}
        </span>
        <span style={s.resultPop}>{formatPop(place.populationMax)}</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  topBar: { padding: `${spacing.lg + 2}px ${spacing.xl - 2}px ${spacing.sm}px` },
  titleWrap: { display: "flex", flexDirection: "column", gap: spacing.xs + 2 },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
  },
  searchWrap: {
    padding: `0 ${spacing.xl - 2}px`,
    display: "flex",
    gap: spacing.sm + 2,
    alignItems: "center",
    marginBottom: spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.lg,
    background: colors.bg.base,
    padding: `${spacing.md}px ${spacing.md + 2}px`,
    outline: "none",
    fontFamily: "inherit",
    fontSize: typography.size.base,
    color: colors.text.primary,
    boxShadow: shadow.sm,
  },
  clearBtn: {
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.lg,
    padding: `${spacing.sm + 2}px ${spacing.md}px`,
    cursor: "pointer",
    background: colors.bg.base,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
    fontFamily: "inherit",
  },
  content: { flex: 1, padding: `0 ${spacing.md + 2}px ${spacing.md + 2}px` },
  stateText: {
    textAlign: "center",
    color: colors.text.secondary,
    padding: `${spacing.lg + 2}px 0`,
    fontSize: typography.size.sm,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${spacing.sm}px 2px ${spacing.sm + 2}px`,
  },
  sectionTitle: {
    fontSize: typography.size.base - 1,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  clearRecentBtn: {
    border: "none",
    background: "none",
    color: colors.text.tertiary,
    fontSize: typography.size.sm,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  resultItem: {
    background: colors.bg.base,
    borderRadius: radius.lg + 4,
    padding: `${spacing.md + 2}px ${spacing.md + 2}px`,
    marginBottom: spacing.sm + 2,
    cursor: "pointer",
    boxShadow: shadow.sm,
    border: `1px solid ${colors.border.light}`,
  },
  resultName: {
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs + 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  resultMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  resultChip: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    padding: `${spacing.xs + 2}px ${spacing.sm + 2}px`,
    borderRadius: radius.full,
  },
  resultPop: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
};
