// 혼잡도 라벨 + 색상 매핑 — MapApp / PlaceReportPage 공통 사용
// "약간 붐빔"이 "붐빔"으로 잘못 매칭되지 않도록 "약간"을 먼저 체크.

import { congestionByTag } from "../styles/theme";

export type StatusInfo = { label: string; color: string; bg: string };

type LabelSet = {
  busy: string;     // "약간 ___"
  crowded: string;  // "붐빔"
  normal: string;   // "보통"
  relaxed: string;  // "여유"
  unknown: string;  // 그 외
};

const makeStatusFromTag = (labels: LabelSet) => (tag: string): StatusInfo => {
  const t = congestionByTag(tag);
  const base = { color: t.text, bg: t.bgSoft };
  if (tag.includes("약간")) return { label: labels.busy,    ...base };
  if (tag.includes("붐빔")) return { label: labels.crowded, ...base };
  if (tag.includes("보통")) return { label: labels.normal,  ...base };
  if (tag.includes("여유")) return { label: labels.relaxed, ...base };
  return { label: labels.unknown, ...base };
};

// 지도 하단 시트 (실제 혼잡 단계명 그대로)
export const statusForMap = makeStatusFromTag({
  busy: "약간 붐빔",
  crowded: "혼잡",
  normal: "보통",
  relaxed: "여유",
  unknown: "확인 중",
});

// 상세 리포트 (사용자 친화 표현)
export const statusForReport = makeStatusFromTag({
  busy: "주의",
  crowded: "혼잡",
  normal: "보통",
  relaxed: "원활",
  unknown: "확인 중",
});
