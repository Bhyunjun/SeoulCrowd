# 발표 빌드 전 체크리스트

발표일: **2026년 6월 3일**

## 디자인 검토 모드 해제 (필수)

`front/.env.local`에서 다음 변수를 **false 또는 미설정** 상태로 둘 것:

```
VITE_DESIGN_REVIEW_MODE=false
```

이 플래그가 `true`로 남아있으면:
- 로그인 우회됨 (인증 흐름 깨짐)
- 모든 API가 목업 10곳 데이터 반환 (실제 서울시 인구 데이터 표시 안 됨)
- 화면 최상단에 🚧 빨간 배너 노출

## 빌드 후 육안 확인

`npm run build && npm run preview` (또는 Vercel 배포 후)

- [ ] 화면 상단에 🚧 빨간 배너가 **없다**
- [ ] 비로그인 상태(`sessionStorage.accessToken` 삭제)로 `/` 진입 시 `/login`으로 리다이렉트된다
- [ ] 지도에 서울시 실시간 데이터(10곳 이상, 좌표가 강남/명동/홍대만이 아님)가 표시된다

## 관련 파일 (검토 모드 분기 위치)

- `front/src/utils/designReviewMock.tsx` — 검토 모드 전체 로직 (목업 데이터 + 배너)
- `front/src/api/client.ts` — `apiFetch`, `getAccessToken` 분기
- `front/src/utils/populationCache.ts` — `fetchPopulation` 분기
- `front/src/App.tsx` — `RequireAuth` 우회 + 배너 렌더
- `front/src/pages/RankingPage.tsx` — 랭킹 직접 fetch 분기
- `front/src/pages/PlaceReportPage.tsx` — 히스토리 직접 fetch 분기

검토 모드를 영구 제거하려면 위 파일들에서 `isDesignReviewMode` import와 `if (isDesignReviewMode()) ...` 분기를 모두 삭제하고 `designReviewMock.tsx`를 지우면 된다.
