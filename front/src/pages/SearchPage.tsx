import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";

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
  const location = useLocation();

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
    <div style={s.bg}>
      <div style={s.phone}>
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

        <div style={s.bottomNav}>
          <button style={s.navItem} onClick={() => navigate("/")}>
            <div style={{ ...s.navIconWrap, background: location.pathname === "/" ? "#2196f3" : "transparent" }}>
              <MapNavIcon active={location.pathname === "/"} />
            </div>
            <span style={{ ...s.navLabel, color: location.pathname === "/" ? "#2196f3" : "#a0b8c8" }}>지도</span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/ranking")}>
            <div style={{ ...s.navIconWrap, background: location.pathname === "/ranking" ? "#2196f3" : "transparent" }}>
              <RankNavIcon active={location.pathname === "/ranking"} />
            </div>
            <span style={{ ...s.navLabel, color: location.pathname === "/ranking" ? "#2196f3" : "#a0b8c8" }}>
              랭킹
            </span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/favorites")}>
            <div style={{ ...s.navIconWrap, background: location.pathname === "/favorites" ? "#2196f3" : "transparent" }}>
              <BookmarkNavIcon active={location.pathname === "/favorites"} />
            </div>
            <span style={{ ...s.navLabel, color: location.pathname === "/favorites" ? "#2196f3" : "#a0b8c8" }}>
              즐겨찾기
            </span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/search")}>
            <div style={{ ...s.navIconWrap, background: location.pathname === "/search" ? "#2196f3" : "transparent" }}>
              <SearchNavIcon active={location.pathname === "/search"} />
            </div>
            <span style={{ ...s.navLabel, color: location.pathname === "/search" ? "#2196f3" : "#a0b8c8" }}>
              검색
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceRow({ place, onClick }: { place: ApiPopulation; onClick: () => void }) {
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
        <span style={s.resultChip}>{place.congestionLevel}</span>
        <span style={s.resultPop}>{formatPop(place.populationMax)}</span>
      </div>
    </div>
  );
}

const MapNavIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#a0b8c8"} strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const RankNavIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#a0b8c8"} strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const SearchNavIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#a0b8c8"} strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);
const BookmarkNavIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#a0b8c8"} strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const s: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #d6edfb 0%, #e4f3fc 60%, #edf8ff 100%)",
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    display: "flex",
    justifyContent: "center",
  },
  phone: {
    width: 375,
    minHeight: 812,
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(20px)",
    borderRadius: 44,
    overflow: "hidden",
    boxShadow: "0 40px 80px rgba(0,80,180,0.10)",
    display: "flex",
    flexDirection: "column",
  },
  topBar: { padding: "18px 22px 8px" },
  titleWrap: { display: "flex", flexDirection: "column", gap: 6 },
  title: { fontSize: 18, fontWeight: 900, color: "#1a2a3a" },
  subtitle: { fontSize: 12, color: "#90aac0" },
  searchWrap: {
    padding: "0 22px",
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 14,
    background: "rgba(255,255,255,0.95)",
    padding: "12px 14px",
    outline: "none",
    fontFamily: "inherit",
    boxShadow: "0 2px 10px rgba(33,150,243,0.06)",
  },
  clearBtn: {
    border: "none",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    background: "rgba(255,255,255,0.8)",
    color: "#5a80a0",
    fontWeight: 800,
  },
  content: { flex: 1, padding: "0 14px 14px", overflowY: "auto" },
  stateText: { textAlign: "center", color: "#7a90a4", padding: "18px 0" },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 2px 10px",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#1a2a3a",
  },
  clearRecentBtn: {
    border: "none",
    background: "none",
    color: "#90aac0",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  resultItem: {
    background: "rgba(255,255,255,0.9)",
    borderRadius: 18,
    padding: "14px 14px",
    marginBottom: 10,
    cursor: "pointer",
    boxShadow: "0 6px 20px rgba(33,150,243,0.07)",
    border: "1px solid rgba(33,150,243,0.08)",
  },
  resultName: { fontWeight: 900, color: "#1a2a3a", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  resultMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  resultChip: { fontSize: 11, fontWeight: 800, color: "#2196f3", background: "#eaf6ff", padding: "6px 10px", borderRadius: 999 },
  resultPop: { fontSize: 14, fontWeight: 900, color: "#1a2a3a" },
  bottomNav: {
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(20px)",
    borderTop: "1px solid rgba(200,220,240,0.3)",
    display: "flex",
    justifyContent: "space-around",
    padding: "12px 0 20px",
    flexShrink: 0,
  },
  navItem: {
    border: "none",
    background: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  },
  navIconWrap: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
  navLabel: { fontSize: 10, fontWeight: 500 },
};
