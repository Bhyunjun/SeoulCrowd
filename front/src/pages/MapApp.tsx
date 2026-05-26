import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { getAccessToken, apiFetch } from "../api/client";
import { AppLayout } from "../components/AppLayout";
import { colors, typography, spacing, radius, shadow, congestionByTag } from "../styles/theme";

// ─── Types ───────────────────────────────────────────────────────────────────
interface PlaceInfo {
  name: string;
  tag: string;
  population: string;
  populationRange: string;
  populationMaxRaw?: number;
  address?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const NAVER_CLIENT_ID = "hr1545a1u5";

// ─── Declare naver global ───────────────────────────────────────────────────
declare global {
  interface Window {
    naver?: unknown;
  }
}

type NaverMapsNamespace = {
  Map: new (el: HTMLElement, opts: { center: unknown; zoom: number }) => unknown;
  LatLng: new (lat: number, lng: number) => unknown;
  Marker: new (opts: { position: unknown; map: unknown; icon: { content: string | HTMLElement; anchor: unknown }; title: string }) => unknown;
  Point: new (x: number, y: number) => unknown;
  Event: { addListener: (target: unknown, eventName: string, handler: () => void) => void };
};

type NaverMapInstance = {
  setCenter: (latlng: unknown) => void;
  setZoom: (level: number) => void;
};

const getNaverMaps = (): NaverMapsNamespace | null => {
  const naverObj = window.naver;
  if (!naverObj || typeof naverObj !== "object") return null;
  const maps = (naverObj as { maps?: unknown }).maps;
  if (!maps || typeof maps !== "object") return null;
  return maps as NaverMapsNamespace;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const estimateCrowdPercent = (populationMaxRaw?: number) => {
  if (typeof populationMaxRaw !== "number") return null;
  return clamp(Math.round((populationMaxRaw / 50000) * 100), 1, 100);
};

// 마커 점 색상 (강한 채도) — congestionByTag의 bg 사용
const congestionDotColor = (tag: string) => congestionByTag(tag).bg;

// statusLabelFromTag: 한국어 라벨은 유지, 색상은 congestionByTag로 매핑.
// "약간 붐빔"이 "붐빔"으로 잘못 매칭되지 않도록 "약간"을 먼저 체크.
const statusLabelFromTag = (tag: string) => {
  const t = congestionByTag(tag);
  if (tag.includes("약간")) return { label: "약간 붐빔", color: t.text, bg: t.bgSoft };
  if (tag.includes("붐빔")) return { label: "혼잡",      color: t.text, bg: t.bgSoft };
  if (tag.includes("보통")) return { label: "보통",      color: t.text, bg: t.bgSoft };
  if (tag.includes("여유")) return { label: "여유",      color: t.text, bg: t.bgSoft };
  return { label: "확인 중", color: t.text, bg: t.bgSoft };
};

export default function MapApp() {
  const mapRef = useRef<HTMLDivElement>(null);
  const naverMapInstance = useRef<unknown>(null);
  const navigate = useNavigate();

  const [apiReady, setApiReady] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceInfo | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [placesFromApi, setPlacesFromApi] = useState<(PlaceInfo & { lat: number; lng: number })[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [favoriteNames, setFavoriteNames] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const suggestions = searchValue.trim().length > 0
    ? placesFromApi.filter((p) => p.name.includes(searchValue.trim())).slice(0, 6)
    : [];

  // 1. 네이버 지도 스크립트 로드
  useEffect(() => {
    const existingScript = document.getElementById("naver-map-script");
    if (existingScript) {
      const maps = getNaverMaps();
      if (maps) Promise.resolve().then(() => setApiReady(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "naver-map-script";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}`;
    script.onload = () => setApiReady(true);
    document.head.appendChild(script);
  }, []);

  // 2. 인구 데이터 로드 (15분 캐시)
  useEffect(() => {
    const formatPop = (n: number | null | undefined) => {
      if (n == null) return "-";
      return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n.toLocaleString("ko-KR");
    };

    const fetchData = async () => {
      try {
        const list = await fetchPopulation();

        const mapped = list
          .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
          .map((p) => ({
            name: p.areaName,
            tag: p.congestionLevel,
            population: formatPop(p.populationMax),
            populationRange: `${formatPop(p.populationMin)} ~ ${formatPop(p.populationMax)}`,
            populationMaxRaw: p.populationMax,
            lat: p.latitude,
            lng: p.longitude,
          }));

        setPlacesFromApi(mapped);
        setLastUpdatedAt(new Date());
        if (mapped.length > 0) {
          setSelectedPlace((prev) => prev ?? mapped[0]);
        }
      } catch (error) {
        console.error("인구 데이터 불러오기 실패:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch("/api/favorites")
      .then((r) => r.json())
      .then((j) => setFavoriteNames(Array.isArray(j?.favorites) ? j.favorites : []))
      .catch(() => {});
  }, []);

  const isBookmarked = selectedPlace ? favoriteNames.includes(selectedPlace.name) : false;

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

  const panToPlace = (place: PlaceInfo & { lat: number; lng: number }) => {
    const maps = getNaverMaps();
    if (maps && naverMapInstance.current) {
      const mapInst = naverMapInstance.current as NaverMapInstance;
      mapInst.setCenter(new maps.LatLng(place.lat, place.lng));
      mapInst.setZoom(15);
    }
    setSelectedPlace(place);
    setSheetVisible(true);
    setSearchValue("");
    setShowSuggestions(false);
  };

  const toggleFavorite = async () => {
    if (!selectedPlace) return;
    const token = getAccessToken();
    if (!token) {
      alert("즐겨찾기는 로그인 후 사용할 수 있습니다.");
      return;
    }
    if (favoriteBusy) return;
    try {
      setFavoriteBusy(true);
      const placeName = selectedPlace.name;
      const res = isBookmarked
        ? await apiFetch(`/api/favorites/${encodeURIComponent(placeName)}`, { method: "DELETE" })
        : await apiFetch("/api/favorites", {
            method: "POST",
            body: JSON.stringify({ placeName }),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // 서버가 "이미 즐겨찾기"로 400을 주는 경우(목록 로딩 전 클릭 등) 동기화로 해결
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
      // 실패했더라도 서버 상태와 다시 동기화해서 "둘 다 사라짐/되돌아옴" 같은 현상 방지
      await reloadFavorites();
    } finally {
      setFavoriteBusy(false);
    }
  };

  // 3. 지도 초기화
  useEffect(() => {
    const maps = getNaverMaps();
    if (!apiReady || !mapRef.current || !maps || naverMapInstance.current) return;

    naverMapInstance.current = new maps.Map(mapRef.current, {
      center: new maps.LatLng(37.525, 127.06),
      zoom: 12,
    });
  }, [apiReady]);

  // 4. 마커 생성
  useEffect(() => {
    const maps = getNaverMaps();
    if (!maps || !naverMapInstance.current || placesFromApi.length === 0) return;

    placesFromApi.forEach((place) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;cursor:pointer;";

      const color = congestionDotColor(place.tag);
      const dot = document.createElement("div");
      dot.style.cssText = `width:12px;height:12px;background:${color};border-radius:50%;box-shadow:0 2px 8px ${color}80;`;

      const label = document.createElement("div");
      label.textContent = place.name;
      label.style.cssText = `position:absolute;bottom:18px;left:50%;transform:translateX(-50%) translateY(4px);background:${colors.bg.overlay};backdrop-filter:blur(8px);border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:${shadow.sm};pointer-events:none;opacity:0;transition:opacity 0.15s,transform 0.15s;color:${colors.text.primary};border:1px solid ${color}30;font-family:${typography.fontFamily};`;

      wrap.appendChild(dot);
      wrap.appendChild(label);

      const marker = new maps.Marker({
        position: new maps.LatLng(place.lat, place.lng),
        map: naverMapInstance.current,
        icon: { content: wrap, anchor: new maps.Point(6, 6) },
        title: place.name,
      });

      wrap.addEventListener("mouseenter", () => {
        label.style.opacity = "1";
        label.style.transform = "translateX(-50%) translateY(0)";
      });
      wrap.addEventListener("mouseleave", () => {
        label.style.opacity = "0";
        label.style.transform = "translateX(-50%) translateY(4px)";
      });
      maps.Event.addListener(marker, "click", () => {
        setSelectedPlace(place);
        setSheetVisible(true);
      });
    });
  }, [placesFromApi]);

  return (
    <AppLayout>
      {/* ── Map Area ── */}
      <div style={styles.mapContainer}>
        <div ref={mapRef} style={styles.map} />

        {!apiReady && (
          <div style={styles.fallback}>
            <div style={styles.apiNotice}>지도를 불러오는 중...</div>
          </div>
        )}

        <div style={styles.searchBar}>
          <div style={styles.searchWrap}>
            <SearchIcon />
            <input
              style={styles.searchInput}
              placeholder="장소 검색"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions.length > 0) panToPlace(suggestions[0]);
                if (e.key === "Escape") { setSearchValue(""); setShowSuggestions(false); }
              }}
            />
            {searchValue.length > 0 && (
              <button
                style={styles.searchClearBtn}
                onMouseDown={(e) => { e.preventDefault(); setSearchValue(""); setShowSuggestions(false); }}
              >✕</button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div style={styles.suggestionList}>
              {suggestions.map((place) => {
                const t = congestionByTag(place.tag);
                return (
                  <div
                    key={place.name}
                    style={styles.suggestionItem}
                    onMouseDown={() => panToPlace(place)}
                  >
                    <span style={styles.suggestionName}>{place.name}</span>
                    <span style={{ ...styles.suggestionChip, color: t.text, background: t.bgSoft }}>
                      {place.tag}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={styles.timeBadge}>
          <span style={styles.timeDot} />
          <span>
            🌙{" "}
            {lastUpdatedAt
              ? lastUpdatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
              : "--:--"}{" "}
            🌙
          </span>
        </div>
        <button
          style={styles.logoutBtn}
          onClick={() => {
            sessionStorage.removeItem("accessToken");
            navigate("/login", { replace: true });
          }}
          title="로그아웃"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.text.secondary} strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>

        {/* ── Bottom Sheet ── */}
        {selectedPlace && (
          <div
            style={{
              ...styles.bottomSheet,
              transform: sheetVisible ? "translateY(0)" : "translateY(110%)",
            }}
          >
            <div style={styles.sheetHandle} />
            <div style={styles.placeHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={styles.placeTitleRow}>
                  <span style={styles.placeName}>{selectedPlace.name}</span>
                  <button
                    type="button"
                    style={{ ...styles.bookmarkBtn, opacity: favoriteBusy ? 0.6 : 1 }}
                    onClick={toggleFavorite}
                    aria-label="즐겨찾기"
                    title="즐겨찾기"
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{isBookmarked ? "★" : "☆"}</span>
                  </button>
                </div>
                <div style={styles.placeSub}>
                  {selectedPlace.address ?? "주소 정보가 없습니다. (추후 연동 가능)"}
                </div>
              </div>
              <button style={styles.closeBtn} onClick={() => setSheetVisible(false)}>✕</button>
            </div>

            <div style={styles.noticeBar}>
              <div style={styles.noticeIcon}>i</div>
              <div style={styles.noticeText}>
                평상시와 유사한 수준의 인파가 있습니다. 쾌적한 이용이 가능합니다.
              </div>
            </div>

            <div style={styles.pillsRow}>
              {(() => {
                const st = statusLabelFromTag(selectedPlace.tag);
                return (
                  <div style={{ ...styles.pill, background: st.bg, color: st.color }}>
                    <span style={{ ...styles.pillDot, background: st.color }} />
                    {selectedPlace.tag}
                  </div>
                );
              })()}
            </div>

            <div style={styles.statsRow}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>현재 혼잡 비율</div>
                <div style={styles.statValue}>
                  {estimateCrowdPercent(selectedPlace.populationMaxRaw) != null
                    ? `${estimateCrowdPercent(selectedPlace.populationMaxRaw)}%`
                    : "--"}
                </div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>혼잡 예상</div>
                {(() => {
                  const st = statusLabelFromTag(selectedPlace.tag);
                  return <div style={styles.statValue}>{st.label}</div>;
                })()}
              </div>
            </div>

            <button
              type="button"
              style={styles.reportBtn}
              onClick={() =>
                navigate(`/report/${encodeURIComponent(selectedPlace.name)}`, {
                  state: { place: selectedPlace },
                })
              }
            >
              상세 리포트 보기 →
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// 검색 바 안의 돋보기. nav 아이콘은 BottomNav 컴포넌트로 이동됨.
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.text.tertiary} strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  mapContainer: { flex: 1, position: "relative" },
  map: { position: "absolute", inset: 0 },
  fallback: {
    position: "absolute",
    inset: 0,
    background: colors.bg.subtle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  apiNotice: {
    padding: `${spacing.md}px ${spacing.lg + 2}px`,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    background: colors.bg.overlay,
    borderRadius: radius.lg,
  },
  searchBar: { position: "absolute", top: spacing.xl - 4, left: spacing.xl - 4, right: spacing.xl - 4, zIndex: 10 },
  searchWrap: {
    background: colors.bg.overlay,
    borderRadius: radius.lg + 2,
    padding: `${spacing.md}px ${spacing.lg + 2}px`,
    display: "flex",
    alignItems: "center",
    gap: spacing.sm + 2,
    backdropFilter: "blur(10px)",
    boxShadow: shadow.md,
  },
  searchInput: {
    border: "none",
    background: "transparent",
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
    fontSize: typography.size.base,
    color: colors.text.primary,
  },
  searchClearBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    color: colors.text.tertiary,
    fontSize: 14,
    padding: "0 2px",
    lineHeight: 1,
  },
  suggestionList: {
    marginTop: spacing.xs + 2,
    background: colors.bg.overlay,
    borderRadius: radius.lg,
    backdropFilter: "blur(16px)",
    boxShadow: shadow.lg,
    overflow: "hidden",
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.sm + 3}px ${spacing.lg}px`,
    cursor: "pointer",
    borderBottom: `1px solid ${colors.border.light}`,
    gap: spacing.sm + 2,
  },
  suggestionName: {
    fontSize: typography.size.base - 1,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  suggestionChip: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    borderRadius: radius.full,
    padding: `3px ${spacing.sm}px`,
    flexShrink: 0,
  },
  timeBadge: {
    position: "absolute",
    top: 74,
    right: spacing.xl - 4,
    zIndex: 10,
    background: colors.bg.overlay,
    borderRadius: radius.xl,
    padding: `${spacing.xs + 2}px ${spacing.md + 2}px`,
    display: "flex",
    alignItems: "center",
    gap: spacing.xs + 2,
    fontSize: typography.size.base - 1,
    color: colors.text.primary,
    boxShadow: shadow.sm,
  },
  logoutBtn: {
    position: "absolute",
    top: 74,
    left: spacing.xl - 4,
    zIndex: 10,
    background: colors.bg.overlay,
    border: "none",
    borderRadius: radius.xl,
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    display: "flex",
    alignItems: "center",
    gap: spacing.xs + 2,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
    boxShadow: shadow.sm,
  },
  timeDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    background: colors.brand.accent,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    background: colors.bg.base,
    backdropFilter: "blur(20px)",
    borderRadius: `${radius.xl + 4}px ${radius.xl + 4}px 0 0`,
    padding: `${spacing.md}px ${spacing.xl - 4}px ${spacing.xl + 6}px`,
    boxShadow: shadow.lg,
    transition: "transform 0.35s ease-out",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    background: colors.border.medium,
    borderRadius: 2,
    margin: `0 auto ${spacing.lg}px`,
  },
  placeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  placeTitleRow: { display: "flex", alignItems: "center", gap: spacing.sm, minWidth: 0 },
  placeName: {
    fontSize: typography.size.lg + 2,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  placeSub: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  closeBtn: {
    border: "none",
    background: colors.bg.muted,
    borderRadius: radius.full,
    width: 28,
    height: 28,
    cursor: "pointer",
    color: colors.text.secondary,
  },
  bookmarkBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 2 },
  noticeBar: {
    display: "flex",
    gap: spacing.sm + 2,
    alignItems: "flex-start",
    background: colors.bg.subtle,
    borderRadius: radius.lg,
    padding: `${spacing.sm + 2}px ${spacing.md}px`,
    marginBottom: spacing.md,
  },
  noticeIcon: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    background: colors.bg.muted,
    color: colors.brand.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  noticeText: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: 1.35,
  },
  pillsRow: { display: "flex", gap: spacing.sm, alignItems: "center", marginBottom: spacing.md },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.full,
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pillDot: { width: 8, height: 8, borderRadius: radius.full },
  statsRow: { display: "flex", gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    background: colors.bg.base,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.lg,
    padding: `${spacing.md + 2}px`,
    boxShadow: shadow.sm,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.text.secondary,
    marginBottom: spacing.xs + 2,
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  reportBtn: {
    width: "100%",
    border: "none",
    borderRadius: radius.lg,
    padding: `${spacing.md}px ${spacing.md + 2}px`,
    cursor: "pointer",
    fontWeight: typography.weight.bold,
    background: colors.brand.accent,
    color: colors.text.inverse,
    fontFamily: "inherit",
  },
};
