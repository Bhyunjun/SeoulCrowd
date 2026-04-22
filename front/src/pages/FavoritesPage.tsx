import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { apiFetch, getAccessToken } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Place {
  name: string;
  tag: string;
  tagColor: string;
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
  const navigate = useNavigate();
  const location = useLocation();

  const places: Place[] = useMemo(() => {
    const updatedLabel = lastUpdatedAt ? `업데이트 ${formatTime(lastUpdatedAt)}` : "업데이트 --:--";
    return favoriteNames.map((name) => {
      const info = populationMap.get(name);
      const congestionLevel = info?.congestionLevel ?? "정보 없음";
      let tagColor = "#90aac0";
      if (congestionLevel.includes("붐빔")) tagColor = "#f44336";
      else if (congestionLevel.includes("약간")) tagColor = "#ff9800";
      else if (congestionLevel.includes("여유")) tagColor = "#4caf50";

      const min = info?.populationMin;
      const max = info?.populationMax;
      const avg = typeof min === "number" && typeof max === "number" ? Math.round((min + max) / 2) : null;
      const populationText = avg !== null ? `${(avg / 10000).toFixed(1)}만` : "-";

      return {
        name,
        tag: congestionLevel,
        tagColor,
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
    <div style={s.bg}>
      {/* Top bar */}
      <div style={s.topBar}>
        <div style={s.logoRow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span style={s.logoText}>SEOUL Favorites</span>
        </div>
        <div style={s.topActions}>
          <button style={s.iconBtn}>🌙</button>
          <button style={s.avatarBtn}>B</button>
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
          <button style={s.editBtn}>목록 편집</button>
        </div>

        {/* Cards */}
        <div style={s.cardsRow}>
          {loading && <div style={{ ...s.notice, marginTop: 0 }}>즐겨찾기 불러오는 중...</div>}
          {!loading && error && <div style={{ ...s.notice, marginTop: 0 }}>{error}</div>}
          {!loading && !error && places.length === 0 && (
            <div style={{ ...s.notice, marginTop: 0 }}>즐겨찾기한 장소가 없습니다.</div>
          )}
          {!loading && !error && places.map((place) => (
            <PlaceCard key={place.name} place={place} onBookmark={() => removeFavorite(place.name)} />
          ))}
        </div>

        {/* Bottom notice */}
        <div style={s.notice}>
          <span style={{ color: "#2196f3", fontSize: 9 }}>●</span>
          서울의 인구 밀도를 데이터로 지금 바로 파악하고 있습니다
        </div>
      </div>

      {/* Bottom Nav */}
      <div style={s.bottomNav}>
        <button style={s.navItem} onClick={() => navigate("/")}>
          <div
            style={{
              ...s.navIconWrap,
              background: location.pathname === "/" ? "#2196f3" : "transparent",
            }}
          >
            <MapNavIcon active={location.pathname === "/"} />
          </div>
          <span
            style={{
              ...s.navLabel,
              color: location.pathname === "/" ? "#2196f3" : "#a0b8c8",
            }}
          >
            지도
          </span>
        </button>
        <button style={s.navItem} onClick={() => navigate("/ranking")}>
          <div
            style={{
              ...s.navIconWrap,
              background: location.pathname === "/ranking" ? "#2196f3" : "transparent",
            }}
          >
            <RankNavIcon active={location.pathname === "/ranking"} />
          </div>
          <span
            style={{
              ...s.navLabel,
              color: location.pathname === "/ranking" ? "#2196f3" : "#a0b8c8",
            }}
          >
            랭킹
          </span>
        </button>
        <button style={s.navItem} onClick={() => navigate("/search")}>
          <div
            style={{
              ...s.navIconWrap,
              background: location.pathname === "/search" ? "#2196f3" : "transparent",
            }}
          >
            <SearchNavIcon active={location.pathname === "/search"} />
          </div>
          <span
            style={{
              ...s.navLabel,
              color: location.pathname === "/search" ? "#2196f3" : "#a0b8c8",
            }}
          >
            검색
          </span>
        </button>
        <button style={s.navItem} onClick={() => navigate("/favorites")}>
          <div
            style={{
              ...s.navIconWrap,
              background: location.pathname === "/favorites" ? "#2196f3" : "transparent",
            }}
          >
            <BookmarkNavIcon active={location.pathname === "/favorites"} />
          </div>
          <span
            style={{
              ...s.navLabel,
              color: location.pathname === "/favorites" ? "#2196f3" : "#a0b8c8",
            }}
          >
            즐겨찾기
          </span>
        </button>
      </div>
    </div>
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
        boxShadow: hovered
          ? "0 16px 40px rgba(33,150,243,0.18)"
          : "0 6px 24px rgba(33,150,243,0.09)",
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
      {/* Card top */}
      <div style={s.cardTop}>
        <span style={s.cardIcon}>⭐</span>
        <button
          style={s.starBtn}
          onClick={(e) => {
            e.stopPropagation();
            onBookmark();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24"
            fill={place.bookmarked ? "#f5c518" : "none"}
            stroke={place.bookmarked ? "#f5c518" : "#c0d4e0"}
            strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
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
            <span style={{ ...s.tagChip, background: place.tagColor + "22", color: place.tagColor }}>
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

// ─── Nav Icons ────────────────────────────────────────────────────────────────
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
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const BookmarkNavIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#a0b8c8"} strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #d6edfb 0%, #e4f3fc 60%, #edf8ff 100%)",
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 28px",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logoText: {
    fontSize: 14,
    fontWeight: 600,
    color: "#2a4a6a",
    letterSpacing: "0.03em",
  },
  topActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  iconBtn: {
    background: "rgba(255,255,255,0.7)",
    border: "none",
    borderRadius: "50%",
    width: 36,
    height: 36,
    cursor: "pointer",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2196f3, #1565c0)",
    border: "none",
    color: "white",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 3px 12px rgba(33,150,243,0.3)",
  },
  main: {
    flex: 1,
    padding: "0 28px 20px",
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: "0.15em",
    color: "#90aac0",
    fontWeight: 500,
    margin: "0 0 4px",
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: 700,
    color: "#1a2a3a",
    letterSpacing: "-0.8px",
    margin: 0,
  },
  editBtn: {
    background: "rgba(255,255,255,0.75)",
    border: "none",
    borderRadius: 12,
    padding: "8px 16px",
    fontSize: 12,
    color: "#5a80a0",
    cursor: "pointer",
    fontFamily: "inherit",
    backdropFilter: "blur(8px)",
    boxShadow: "0 2px 8px rgba(33,150,243,0.08)",
  },
  cardsRow: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    paddingBottom: 8,
    scrollbarWidth: "none",
  },
  card: {
    minWidth: 220,
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(16px)",
    borderRadius: 22,
    padding: "20px 18px 16px",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
    flexShrink: 0,
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 22,
  },
  starBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 2,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1a2a3a",
    margin: "0 0 4px",
    letterSpacing: "-0.3px",
  },
  cardAddress: {
    fontSize: 11,
    color: "#90aac0",
    margin: 0,
  },
  cardDivider: {
    height: 1,
    background: "rgba(180,210,230,0.35)",
    margin: "14px 0",
  },
  cardStats: {
    display: "flex",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 10,
    color: "#90aac0",
    margin: "0 0 6px",
    letterSpacing: "0.03em",
  },
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  tagChip: {
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 8,
    padding: "3px 8px",
  },
  popValue: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1a2a3a",
    margin: "4px 0 0",
    letterSpacing: "-0.3px",
  },
  updatedAt: {
    fontSize: 10,
    color: "#a0b8c8",
    margin: "10px 0 0",
  },
  notice: {
    marginTop: 24,
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: "10px 18px",
    fontSize: 12,
    color: "#5a7a90",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 2px 10px rgba(33,150,243,0.08)",
  },
  bottomNav: {
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(20px)",
    borderTop: "1px solid rgba(200,220,240,0.3)",
    display: "flex",
    justifyContent: "space-around",
    padding: "12px 0 20px",
  },
  navItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
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
  navLabel: {
    fontSize: 10,
    fontWeight: 500,
  },
};
