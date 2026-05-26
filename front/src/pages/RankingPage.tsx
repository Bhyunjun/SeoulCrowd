import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../api/client";
import { isDesignReviewMode, mockRankingResponse } from "../utils/designReviewMock";
import { AppLayout } from "../components/AppLayout";
import { colors, typography, spacing, radius, shadow, congestionByTag } from "../styles/theme";

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
        let data: ApiRankingResponse;
        if (isDesignReviewMode()) {
          data = mockRankingResponse();
        } else {
          const res = await fetch(apiUrl("/api/population/ranking/top"));
          if (!res.ok) {
            throw new Error("랭킹 데이터를 불러오지 못했습니다.");
          }
          data = (await res.json()) as ApiRankingResponse;
        }
        setLastUpdatedAt(new Date());

        const mapItem = (item: ApiRankingItem, index: number, type: "busy" | "free"): RankItem => {
          const congestionLevel = item.congestionLevel ?? "";
          const tagToken = congestionByTag(congestionLevel);

          const min = item.populationMin;
          const max = item.populationMax;
          const avg = typeof min === "number" && typeof max === "number" ? Math.round((min + max) / 2) : null;
          const populationText = avg === null
            ? "-"
            : avg >= 10000
              ? `${(avg / 10000).toFixed(1)}만명`
              : `${avg.toLocaleString("ko-KR")}명`;

          return {
            id: index + 1,
            name: item.areaName,
            tag: congestionLevel || (type === "busy" ? "혼잡" : "여유"),
            tagColor: tagToken.text,
            tagBg: tagToken.bgSoft,
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
    <AppLayout>
      <div style={s.content}>
        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>실시간 혼잡도 랭킹</h1>
          <div style={s.timeRow}>
            <span style={s.timeDot} />
            <span style={s.timeText}>
              {timeText ? `${timeText} 기준 업데이트됨` : "업데이트 시각 불러오는 중"}
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
                boxShadow: hoveredId === item.id ? shadow.md : shadow.sm,
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
                color: idx < 2 ? colors.brand.accent : colors.text.tertiary,
                fontWeight: idx < 2 ? typography.weight.bold : typography.weight.medium,
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.border.medium} strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  content: {
    flex: 1,
    padding: `${spacing["2xl"]}px ${spacing.lg}px ${spacing.lg}px`,
  },
  header: {
    marginBottom: spacing.xl - 4,
  },
  title: {
    fontSize: typography.size.xl + 2,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: "-0.5px",
    margin: `0 0 ${spacing.sm}px`,
  },
  timeRow: {
    display: "flex",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  timeDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    background: colors.brand.accent,
    display: "inline-block",
    flexShrink: 0,
  },
  timeText: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    fontWeight: typography.weight.regular,
  },
  tabWrap: {
    marginBottom: spacing.lg + 2,
  },
  tabTrack: {
    display: "flex",
    background: colors.bg.muted,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tabBtn: {
    flex: 1,
    border: "none",
    borderRadius: radius.md + 1,
    padding: `${spacing.sm + 3}px 0`,
    fontSize: typography.size.base - 1,
    fontWeight: typography.weight.semibold,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  tabBtnActive: {
    background: colors.brand.accent,
    color: colors.text.inverse,
    boxShadow: shadow.md,
  },
  tabBtnInactive: {
    background: "transparent",
    color: colors.text.tertiary,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.sm + 2,
  },
  stateText: {
    fontSize: typography.size.base - 1,
    color: colors.text.secondary,
    textAlign: "center",
    padding: `${spacing.xl}px 0`,
  },
  listItem: {
    background: colors.bg.base,
    borderRadius: radius.lg + 4,
    padding: `${spacing.lg}px ${spacing.lg + 2}px`,
    display: "flex",
    alignItems: "center",
    gap: spacing.lg,
    cursor: "pointer",
    border: `1px solid ${colors.border.light}`,
    transition: "transform 0.18s, box-shadow 0.18s",
  },
  rankNum: {
    fontSize: typography.size.lg,
    minWidth: 22,
    textAlign: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    display: "block",
    marginBottom: spacing.xs + 2,
    letterSpacing: "-0.2px",
  },
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
  },
  tagChip: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    borderRadius: radius.sm + 2,
    padding: `3px ${spacing.sm + 1}px`,
  },
  popText: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    display: "flex",
    alignItems: "center",
  },
};
