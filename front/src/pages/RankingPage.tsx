import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiUrl } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = "busy" | "free";

interface RankItem {
  id: number;
  name: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  population: string;
}

type ApiRankingItem = {
  areaName: string;
  congestionLevel?: string;
  populationMin?: number;
  populationMax?: number;
};

type ApiRankingResponse = {
  crowded?: ApiRankingItem[];
  quiet?: ApiRankingItem[];
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function RankingPage() {
  const [tab, setTab] = useState<TabType>("busy");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [busyList, setBusyList] = useState<RankItem[]>([]);
  const [freeList, setFreeList] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(apiUrl("/api/population/ranking/top"));
        if (!res.ok) {
          throw new Error("랭킹 데이터를 불러오지 못했습니다.");
        }
        const data = (await res.json()) as ApiRankingResponse;
        setLastUpdatedAt(new Date());

        const mapItem = (item: ApiRankingItem, index: number, type: "busy" | "free"): RankItem => {
          const congestionLevel = item.congestionLevel ?? "";
          let tagColor = "#4caf50";
          let tagBg = "#e8f5e9";

          if (congestionLevel.includes("붐빔")) {
            tagColor = "#f44336";
            tagBg = "#fdecea";
          } else if (congestionLevel.includes("약간")) {
            tagColor = "#ff9800";
            tagBg = "#fff3e0";
          }

          const min = item.populationMin;
          const max = item.populationMax;
          const avg = typeof min === "number" && typeof max === "number" ? Math.round((min + max) / 2) : null;
          const populationText = avg !== null ? `${(avg / 10000).toFixed(1)}만명` : "-";

          return {
            id: index + 1,
            name: item.areaName,
            tag: congestionLevel || (type === "busy" ? "혼잡" : "여유"),
            tagColor,
            tagBg,
            population: populationText,
          };
        };

        const crowded = data.crowded ?? [];
        const quiet = data.quiet ?? [];

        setBusyList(crowded.map((item, idx) => mapItem(item, idx, "busy")));
        setFreeList(quiet.map((item, idx) => mapItem(item, idx, "free")));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchRanking();
  }, []);

  const list = tab === "busy" ? busyList : freeList;
  const timeText = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  return (
    <div style={s.bg}>
      {/* Moon toggle */}
      <button style={s.moonBtn}>🌙</button>

      {/* Phone shell */}
      <div style={s.phone}>

        {/* Content scroll */}
        <div style={s.scrollArea}>
          {/* Header */}
          <div style={s.header}>
            <h1 style={s.title}>실시간 혼잡도 랭킹</h1>
            <div style={s.timeRow}>
              <span style={s.timeDot} />
              <span style={s.timeText}>
                🌙 {timeText ? `${timeText} 기준 업데이트됨` : "업데이트 시각 불러오는 중"}
              </span>
            </div>
          </div>

          {/* Tab switch */}
          <div style={s.tabWrap}>
            <div style={s.tabTrack}>
              <button
                style={{ ...s.tabBtn, ...(tab === "busy" ? s.tabBtnActive : s.tabBtnInactive) }}
                onClick={() => setTab("busy")}
              >
                혼잡한 순
              </button>
              <button
                style={{ ...s.tabBtn, ...(tab === "free" ? s.tabBtnActive : s.tabBtnInactive) }}
                onClick={() => setTab("free")}
              >
                여유로운 순
              </button>
            </div>
          </div>

          {/* List */}
          <div style={s.list}>
            {loading && (
              <div style={s.stateText}>실시간 랭킹을 불러오는 중입니다...</div>
            )}
            {!loading && error && (
              <div style={s.stateText}>{error}</div>
            )}
            {!loading && !error && list.length === 0 && (
              <div style={s.stateText}>표시할 랭킹 데이터가 없습니다.</div>
            )}
            {!loading && !error && list.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  ...s.listItem,
                  transform: hoveredId === item.id ? "translateX(4px)" : "translateX(0)",
                  boxShadow: hoveredId === item.id
                    ? "0 8px 28px rgba(33,150,243,0.13)"
                    : "0 2px 12px rgba(33,150,243,0.06)",
                }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() =>
                  navigate(`/report/${encodeURIComponent(item.name)}`, {
                    state: {
                      place: {
                        name: item.name,
                        tag: item.tag,
                        population: item.population,
                        populationRange: undefined,
                        populationMaxRaw: undefined,
                        address: undefined,
                      },
                    },
                  })
                }
              >
                {/* Rank number */}
                <span style={{
                  ...s.rankNum,
                  color: idx < 2 ? "#2196f3" : "#b0c4d4",
                  fontWeight: idx < 2 ? 700 : 500,
                }}>
                  {item.id}
                </span>

                {/* Info */}
                <div style={s.itemInfo}>
                  <span style={s.itemName}>{item.name}</span>
                  <div style={s.itemMeta}>
                    <span style={{ ...s.tagChip, color: item.tagColor, background: item.tagBg }}>
                      {item.tag}
                    </span>
                    <span style={s.popText}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={item.tagColor} strokeWidth="2" style={{ marginRight: 3 }}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {item.population}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0d4e0" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Nav */}
        <div style={s.bottomNav}>
          <button style={s.navItem} onClick={() => navigate("/")}>
            <MapIcon active={location.pathname === "/"} />
            <span
              style={{
                fontSize: 10,
                color: location.pathname === "/" ? "#2196f3" : "#b0c4d4",
                fontWeight: location.pathname === "/" ? 600 : 400,
              }}
            >
              지도
            </span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/ranking")}>
            <RankIcon active={location.pathname === "/ranking"} />
            <span
              style={{
                fontSize: 10,
                color: location.pathname === "/ranking" ? "#2196f3" : "#b0c4d4",
                fontWeight: location.pathname === "/ranking" ? 600 : 400,
              }}
            >
              랭킹
            </span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/search")}>
            <SearchNavIcon active={location.pathname === "/search"} />
            <span
              style={{
                fontSize: 10,
                color: location.pathname === "/search" ? "#2196f3" : "#b0c4d4",
                fontWeight: location.pathname === "/search" ? 600 : 400,
              }}
            >
              검색
            </span>
          </button>
          <button style={s.navItem} onClick={() => navigate("/favorites")}>
            <BookmarkIcon active={location.pathname === "/favorites"} />
            <span
              style={{
                fontSize: 10,
                color: location.pathname === "/favorites" ? "#2196f3" : "#b0c4d4",
                fontWeight: location.pathname === "/favorites" ? 600 : 400,
              }}
            >
              즐겨찾기
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const MapIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const RankIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const BookmarkIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const SearchNavIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #d6edfb 0%, #e4f3fc 60%, #edf8ff 100%)",
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    position: "relative",
  },
  moonBtn: {
    position: "fixed",
    bottom: 24,
    right: 24,
    background: "rgba(255,255,255,0.85)",
    border: "none",
    borderRadius: "50%",
    width: 42,
    height: 42,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(33,150,243,0.18)",
    backdropFilter: "blur(8px)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  phone: {
    width: 375,
    minHeight: 660,
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(20px)",
    borderRadius: 36,
    boxShadow: "0 30px 70px rgba(33,150,243,0.16), 0 0 0 1px rgba(255,255,255,0.8) inset",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "32px 20px 16px",
    scrollbarWidth: "none",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a2a3a",
    letterSpacing: "-0.5px",
    margin: "0 0 8px",
  },
  timeRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  timeDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#2196f3",
    display: "inline-block",
    flexShrink: 0,
  },
  timeText: {
    fontSize: 12,
    color: "#90aac0",
    fontWeight: 400,
  },
  tabWrap: {
    marginBottom: 18,
  },
  tabTrack: {
    display: "flex",
    background: "#f0f6fb",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    border: "none",
    borderRadius: 11,
    padding: "11px 0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  tabBtnActive: {
    background: "linear-gradient(135deg, #2196f3, #1976d2)",
    color: "white",
    boxShadow: "0 4px 14px rgba(33,150,243,0.30)",
  },
  tabBtnInactive: {
    background: "transparent",
    color: "#90aac0",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    color: "#7a90a4",
    textAlign: "center",
    padding: "24px 0",
  },
  listItem: {
    background: "rgba(255,255,255,0.90)",
    borderRadius: 18,
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    cursor: "pointer",
    transition: "transform 0.18s, box-shadow 0.18s",
  },
  rankNum: {
    fontSize: 18,
    minWidth: 22,
    textAlign: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1a2a3a",
    display: "block",
    marginBottom: 6,
    letterSpacing: "-0.2px",
  },
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tagChip: {
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 8,
    padding: "3px 9px",
  },
  popText: {
    fontSize: 12,
    color: "#7a90a4",
    display: "flex",
    alignItems: "center",
  },
  bottomNav: {
    background: "rgba(255,255,255,0.95)",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "12px 0 20px",
    borderTop: "1px solid rgba(200,220,240,0.35)",
    flexShrink: 0,
  },
  navItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 24px",
    fontFamily: "inherit",
  },
};
