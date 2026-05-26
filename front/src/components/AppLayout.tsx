import type { CSSProperties, ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { colors, typography } from "../styles/theme";

type Props = {
  children: ReactNode;
  hideNav?: boolean;
};

export function AppLayout({ children, hideNav = false }: Props) {
  return (
    <div style={outerStyle}>
      <div style={innerStyle}>
        <main style={mainStyle}>{children}</main>
        {!hideNav && <BottomNav />}
      </div>
    </div>
  );
}

const outerStyle: CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  background: colors.bg.subtle,
  fontFamily: typography.fontFamily,
  color: colors.text.primary,
};

const innerStyle: CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: colors.bg.base,
};

const mainStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};
