import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Map, BarChart3, Search, Star } from "lucide-react";
import { colors, typography, spacing, shadow } from "../styles/theme";

type NavItem = {
  path: string;
  label: string;
  Icon: typeof Map;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/",          label: "지도",     Icon: Map },
  { path: "/ranking",   label: "랭킹",     Icon: BarChart3 },
  { path: "/search",    label: "검색",     Icon: Search },
  { path: "/favorites", label: "즐겨찾기", Icon: Star },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav style={navStyle} aria-label="하단 내비게이션">
      {NAV_ITEMS.map(({ path, label, Icon }) => {
        const active = pathname === path;
        const color = active ? colors.brand.accent : colors.text.tertiary;
        return (
          <button
            key={path}
            type="button"
            style={itemStyle}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} color={color} strokeWidth={2} />
            <span style={{ ...labelStyle, color }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const navStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 50,
  background: colors.bg.base,
  borderTop: `1px solid ${colors.border.light}`,
  display: "flex",
  justifyContent: "space-around",
  padding: `${spacing.sm + 2}px 0 ${spacing.lg + 2}px`,
  boxShadow: shadow.sm,
  fontFamily: typography.fontFamily,
};

const itemStyle: CSSProperties = {
  border: "none",
  background: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: spacing.xs,
  cursor: "pointer",
  padding: `${spacing.xs}px ${spacing.md}px`,
  flex: 1,
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: typography.weight.medium,
};
