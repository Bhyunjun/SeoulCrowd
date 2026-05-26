# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

- `front/` — Vite + React 19 + TypeScript SPA (the only active code in this repo).
- `seoul-crowd-map-backend/` — empty placeholder. The real backend runs externally at `http://13.125.207.164:3000` (EC2). Do not assume backend source is available locally; if API behavior is in question, treat it as a black box and ask.

All commands below must be run from `front/`.

## Commands

```powershell
cd front
npm install
npm run dev      # Vite dev server (proxies /api to VITE_API_URL or the hard-coded EC2 IP)
npm run build    # tsc -b && vite build
npm run lint     # ESLint (flat config in eslint.config.js)
npm run preview  # serve the built dist/
```

There is no test runner configured. Don't add one unless asked.

## Environment

Copy `front/.env.example` to `front/.env.local` if you need to override:
- `VITE_API_URL` — backend base URL. Falls back to the EC2 IP in `vite.config.ts` for the dev proxy and to `""` (same-origin) in `src/api/client.ts` at runtime. In Vercel this must be set in the project's Environment Variables.
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth web client ID (a default is hard-coded in `LoginPage.tsx`).

The Naver Maps client ID (`NAVER_CLIENT_ID` in `src/pages/MapApp.tsx`) is hard-coded, not env-driven.

## Architecture

**Auth model.** Google Sign-In on `/login` posts the Google credential to `POST /api/auth/google`, receives a JWT, and stores it in `sessionStorage` under `accessToken`. `App.tsx` wraps every non-login route in `RequireAuth`, which redirects to `/login` if the token is missing. `src/api/client.ts` exposes `apiFetch` / `apiUrl` / `getAccessToken`; `apiFetch` automatically attaches `Authorization: Bearer <token>` and `Content-Type: application/json`. Use `apiFetch` for any authenticated request — do not call `fetch` directly with manual headers.

**API base URL resolution.** Two layers:
1. Dev: `vite.config.ts` proxies `/api/*` to `VITE_API_URL`. So in dev, calling `apiUrl("/api/foo")` against an empty `VITE_API_URL` still works because Vite proxies it.
2. Prod (Vercel): `VITE_API_URL` is read at build time into `apiUrl`, producing absolute URLs to the EC2 backend. CORS is the backend's responsibility.

**Routing.** `react-router-dom` v7, all routes declared in `src/App.tsx`. The app is a small set of full-page screens (`MapApp`, `RankingPage`, `FavoritesPage`, `SearchPage`, `PlaceReportPage`, `LoginPage`) — there is no shared layout component; each page redraws its own bottom nav and styles. If you add a route, also add it to the bottom-nav buttons in each page that has one.

**Population data flow.** All "live crowd" data comes from `GET /api/population` and is fetched through `src/utils/populationCache.ts`, which caches the response in `localStorage` (`population_cache_data` / `population_cache_ts`) for 15 minutes. Pages that need population info (`MapApp`, `SearchPage`, `FavoritesPage`, `PlaceReportPage`) all go through `fetchPopulation()` — keep it that way so the cache stays consistent. The ranking page hits a separate endpoint (`/api/population/ranking/top`) and does not use this cache.

**Favorites.** Server-side, scoped to the JWT user. Endpoints: `GET /api/favorites`, `POST /api/favorites` (body: `{ placeName }`), `DELETE /api/favorites/:placeName`. `MapApp.toggleFavorite` includes a recovery path: if the server returns 400 with "이미..." (already favorited), it re-syncs by re-fetching the list rather than surfacing the error. Preserve this pattern when touching favorites code — the list can be momentarily out of sync after first paint.

**Naver Maps integration.** Loaded via a `<script>` tag injected once into `<head>` (id `naver-map-script`). The global namespace lives at `window.naver.maps`; access it through the typed helper `getNaverMaps()` in `MapApp.tsx` rather than touching `window` directly. Map initialization, marker creation, and marker styling are all in `MapApp.tsx` — there is no abstraction layer for maps.

**UI shape.** The app is rendered inside a fixed 375×812 "phone frame" (`styles.phone` in each page) regardless of viewport. All styling is inline `React.CSSProperties` objects at the bottom of each file — there is no CSS framework or shared theme. Colors for congestion levels (`#f44336` 붐빔 / `#ff9800` 약간 / `#ffc107` 보통 / `#4caf50` 여유) are duplicated across pages; if changing the palette, grep for the hex codes.

## Conventions specific to this repo

- Source comments and user-facing strings are Korean. Match that when editing existing files.
- TypeScript is strict-ish but uses `unknown` + typed helpers for third-party globals (see `NaverMapsNamespace` in `MapApp.tsx`) rather than `any` or `@ts-ignore` — follow that style.
- ESLint flat config is intentionally minimal (no type-checked rules). Don't introduce rules that would require enabling `parserOptions.project`.
- Branch is `master`, not `main`. Recent commits are in Korean.

## 디자인 작업 가이드라인 (2026-05 UI 개선)

발표일: 2026년 6월 3일. 백엔드 로직과 OAuth/Naver Maps 통합은 절대 건들지 말 것.

### 디자인 토큰
- `src/styles/theme.ts`의 `colors`, `typography`, `spacing`, `shadow`, `radius`, `transition`을 사용
- 인라인 hex 색상(`#2196f3`, `#90aac0`, `#ff9800` 등) 직접 사용 금지
- 혼잡도 색상은 `congestionByTag(tag)` 헬퍼로 매핑

### 레이아웃
- 375×812 폰 프레임 제거하고 풀스크린 반응형으로 변경
- `styles.phone`의 `width`/`height`/`borderRadius`를 `100%`/`100vh`/`0`으로

### 아이콘
- 이모지(🌙, ★, ☆, ✕) 대신 `lucide-react` 사용
- `npm install lucide-react`

### 폰트
- `'Noto Sans KR'` 제거하고 `theme.ts`의 `typography.fontFamily` 사용 (Pretendard)

### 작업 순서
1. `LoginPage.tsx` (가장 단순)
2. `MapApp.tsx` (핵심)
3. `SearchPage`, `RankingPage`, `FavoritesPage`, `PlaceReportPage` 순차

### 변경 원칙
- 한 번에 한 파일만 수정
- 변경 전 반드시 계획부터 보여줄 것
- 백엔드 API 응답 구조 변경 금지
- API 호출 로직(`apiFetch`, `fetchPopulation`) 건들지 말 것
- `MapApp.toggleFavorite`의 400 에러 복구 로직 유지
