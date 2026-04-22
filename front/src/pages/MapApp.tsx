import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchPopulation } from "../utils/populationCache";
import { getAccessToken, apiFetch } from "../api/client";

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

const congestionColor = (tag: string) => {
  if (tag.includes("붐빔")) return "#f44336";
  if (tag.includes("약간")) return "#ff9800";
  if (tag.includes("여유")) return "#4caf50";
  return "#90aac0";
};

const statusLabelFromTag = (tag: string) => {
  if (tag.includes("붐빔")) return { label: "혼잡", color: "#f44336", bg: "#fdecea" };
  if (tag.includes("약간")) return { label: "주의", color: "#ff9800", bg: "#fff3e0" };
  if (tag.includes("여유")) return { label: "원활", color: "#4caf50", bg: "#e8f5e9" };
  return { label: "확인 중", color: "#90aac0", bg: "#eef4f8" };
};

export default function MapApp() {
  const mapRef = useRef<HTMLDivElement>(null);
  const naverMapInstance = useRef<unknown>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

      const dot = document.createElement("div");
      dot.style.cssText = "width:12px;height:12px;background:#2196f3;border-radius:50%;box-shadow:0 2px 8px rgba(33,150,243,0.5);";

      const label = document.createElement("div");
      label.textContent = place.name;
      label.style.cssText = "position:absolute;bottom:18px;left:50%;transform:translateX(-50%) translateY(4px);background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.15);pointer-events:none;opacity:0;transition:opacity 0.15s,transform 0.15s;color:#1a2a3a;border:1px solid rgba(33,150,243,0.12);font-family:'Noto Sans KR',sans-serif;";

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
    <div style={styles.body}>
      <div style={styles.phone}>
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
                {suggestions.map((place) => (
                  <div
                    key={place.name}
                    style={styles.suggestionItem}
                    onMouseDown={() => panToPlace(place)}
                  >
                    <span style={styles.suggestionName}>{place.name}</span>
                    <span style={{ ...styles.suggestionChip, color: congestionColor(place.tag), background: congestionColor(place.tag) + "18" }}>
                      {place.tag}
                    </span>
                  </div>
                ))}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a90a4" strokeWidth="2.2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

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

        {/* ── Bottom Nav ── */}
        <div style={styles.bottomNav}>
          <button style={styles.navItem} onClick={() => navigate("/")}>
            <MapIcon active={location.pathname === "/"} />
            <span style={{ fontSize: 10, color: location.pathname === "/" ? "#2196f3" : "#b0c4d4" }}>지도</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate("/ranking")}>
            <RankIcon active={location.pathname === "/ranking"} />
            <span style={{ fontSize: 10, color: location.pathname === "/ranking" ? "#2196f3" : "#b0c4d4" }}>랭킹</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate("/search")}>
            <SearchNavIcon active={location.pathname === "/search"} />
            <span style={{ fontSize: 10, color: location.pathname === "/search" ? "#2196f3" : "#b0c4d4" }}>검색</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate("/favorites")}>
            <BookmarkIcon active={location.pathname === "/favorites"} />
            <span style={{ fontSize: 10, color: location.pathname === "/favorites" ? "#2196f3" : "#b0c4d4" }}>즐겨찾기</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const SearchIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b0c4d4" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>);
const SearchNavIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);
const MapIcon = ({ active }: { active: boolean }) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>);
const RankIcon = ({ active }: { active: boolean }) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>);
const BookmarkIcon = ({ active }: { active: boolean }) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#2196f3" : "#b0c4d4"} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  body: { fontFamily: "'Noto Sans KR', sans-serif", background: "#e8f3fb", display: "flex", justifyContent: "center", minHeight: "100vh", paddingTop: 16 },
  phone: { width: 375, height: 812, background: "#fff", borderRadius: 44, boxShadow: "0 40px 80px rgba(0,80,180,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" },
  mapContainer: { flex: 1, position: "relative", minHeight: 460 },
  map: { position: "absolute", inset: 0 },
  fallback: { position: "absolute", inset: 0, background: "#f0f8ff", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 },
  apiNotice: { padding: "12px 18px", fontSize: 12, color: "#7a90a4", background: "rgba(255,255,255,0.8)", borderRadius: 14 },
  searchBar: { position: "absolute", top: 20, left: 20, right: 20, zIndex: 10 },
  searchWrap: { background: "rgba(255,255,255,0.9)", borderRadius: 16, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, backdropFilter: "blur(10px)" },
  searchInput: { border: "none", background: "transparent", outline: "none", width: "100%" },
  searchClearBtn: { border: "none", background: "none", cursor: "pointer", color: "#b0c4d4", fontSize: 14, padding: "0 2px", lineHeight: 1 },
  suggestionList: { marginTop: 6, background: "rgba(255,255,255,0.97)", borderRadius: 14, backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(33,150,243,0.13)", overflow: "hidden" },
  suggestionItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", cursor: "pointer", borderBottom: "1px solid rgba(33,150,243,0.06)", gap: 10 },
  suggestionName: { fontSize: 13, fontWeight: 700, color: "#1a2a3a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  suggestionChip: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 8px", flexShrink: 0 },
  timeBadge: { position: "absolute", top: 74, right: 20, zIndex: 10, background: "rgba(255,255,255,0.9)", borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
  logoutBtn: { position: "absolute", top: 74, left: 20, zIndex: 10, background: "rgba(255,255,255,0.9)", border: "none", borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", backdropFilter: "blur(10px)", fontSize: 12, color: "#7a90a4", fontWeight: 600 },
  timeDot: { width: 7, height: 7, borderRadius: "50%", background: "#2196f3" },
  bottomSheet: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: "24px 24px 0 0", padding: "12px 20px 30px", boxShadow: "0 -8px 40px rgba(0,0,0,0.1)", transition: "transform 0.35s ease-out" },
  sheetHandle: { width: 40, height: 4, background: "#d0dfe8", borderRadius: 2, margin: "0 auto 16px" },
  placeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  placeTitleRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  placeName: { fontSize: 20, fontWeight: 700 },
  placeSub: { marginTop: 4, fontSize: 12, color: "#90aac0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  closeBtn: { border: "none", background: "#f0f4f8", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", color: "#7a90a4" },
  bookmarkBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 2 },
  noticeBar: { display: "flex", gap: 10, alignItems: "flex-start", background: "#f3f8ff", borderRadius: 14, padding: "10px 12px", marginBottom: 12 },
  noticeIcon: { width: 18, height: 18, borderRadius: "50%", background: "#e0efff", color: "#2196f3", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  noticeText: { fontSize: 12, color: "#5a7a90", lineHeight: 1.35 },
  pillsRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 },
  pill: { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700 },
  pillDot: { width: 8, height: 8, borderRadius: "50%" },
  statsRow: { display: "flex", gap: 12, marginBottom: 12 },
  statCard: { flex: 1, background: "#ffffff", borderRadius: 14, padding: "14px 14px", boxShadow: "0 6px 20px rgba(33,150,243,0.10)" },
  statLabel: { fontSize: 11, color: "#7a90a4", marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 700 },
  reportBtn: { width: "100%", border: "none", borderRadius: 14, padding: "12px 14px", cursor: "pointer", fontWeight: 700, background: "linear-gradient(135deg, #8ad3f7, #79c6f0)", color: "#1a2a3a" },
  bottomNav: { background: "#fff", display: "flex", justifyContent: "space-around", padding: "10px 0 18px", borderTop: "1px solid #eee" },
  navItem: { border: "none", background: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }
};