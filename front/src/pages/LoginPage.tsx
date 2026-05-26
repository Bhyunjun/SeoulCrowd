import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Moon } from "lucide-react";
import { apiUrl } from "../api/client";
import { colors, typography, spacing, radius, shadow } from "../styles/theme";

// 백엔드 GOOGLE_CLIENT_ID 와 동일한 "웹 클라이언트" ID (우선순위: .env.local 의 VITE_GOOGLE_CLIENT_ID)
const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "691602170405-eppj0nmc4cu6j846su6nvbnoimhvj29j.apps.googleusercontent.com";

export default function LoginPage() {
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const googleToken = credentialResponse.credential;
    if (!googleToken) {
      alert("구글 인증 정보를 받지 못했습니다.");
      return;
    }

    try {
      const response = await fetch(apiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: googleToken }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        token?: string;
        user?: unknown;
        message?: string;
      };

      if (!response.ok || !data.success || !data.token) {
        alert(data.message ?? "로그인에 실패했습니다.");
        return;
      }

      sessionStorage.setItem("accessToken", data.token);

      const meRes = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${data.token}` },
      });

      const meData = (await meRes.json()) as {
        success?: boolean;
        user?: unknown;
        message?: string;
      };

      if (!meRes.ok || !meData.success) {
        sessionStorage.removeItem("accessToken");
        alert(meData.message ?? "세션을 확인할 수 없습니다.");
        return;
      }

      console.log("로그인 성공! 유저 정보:", meData.user ?? data.user);
      navigate("/");
    } catch (error) {
      console.error("서버 통신 에러:", error);
      alert("서버와 통신할 수 없습니다.");
    }
  };

  return (
    // 💡 전체 화면을 Provider로 감싸줍니다.
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <div style={s.bg}>
        {/* Moon toggle top-right */}
        <button style={s.moonBtn} aria-label="테마 전환">
          <Moon size={18} color={colors.text.secondary} />
        </button>

        {/* Card */}
        <div style={s.card}>
          {/* Logo */}
          <div style={s.logoWrap}>
            <div style={s.logoCircle}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.text.inverse} strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </div>

          <h1 style={s.title}>Crowd Map</h1>
          <p style={s.subtitle}>SEOUL POPULATION DENSITY</p>

          {/* 💡 기존 커스텀 버튼을 구글 공식 버튼으로 교체 */}
          <div style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: spacing.sm }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => console.log('구글 로그인 팝업 호출 실패')}
              shape="pill"        // 기존 디자인처럼 둥근 모서리
              theme="outline"     // 하얀 바탕에 얇은 테두리
              text="signin_with"  // "Google로 로그인" 텍스트
              size="large"
              width="328"         // 부모 카드 너비에 맞춤
            />
          </div>
        </div>

        {/* Bottom notice */}
        <div style={s.bottomNotice}>
          <span style={s.noticeDot} />
          서울의 모든 순간을 인구 밀도로 지금 바로 파악해 보세요
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

const s: Record<string, CSSProperties> = {
  bg: {
    minHeight: "100vh",
    background: `linear-gradient(160deg, ${colors.bg.subtle} 0%, ${colors.bg.base} 100%)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: typography.fontFamily,
    padding: `${spacing.xl}px ${spacing.lg}px`,
    position: "relative",
  },
  moonBtn: {
    position: "fixed",
    top: spacing.xl,
    right: spacing.xl,
    background: colors.bg.overlay,
    border: "none",
    borderRadius: radius.full,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: shadow.sm,
    backdropFilter: "blur(8px)",
    zIndex: 100,
  },
  card: {
    background: colors.bg.overlay,
    backdropFilter: "blur(20px)",
    borderRadius: radius["2xl"],
    padding: `44px 36px ${spacing["2xl"]}px`,
    width: "100%",
    maxWidth: 400,
    boxShadow: `${shadow.xl}, 0 0 0 1px rgba(255,255,255,0.9) inset`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },
  logoWrap: {
    marginBottom: spacing.lg + 2,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    background: colors.brand.accent,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadow.md,
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: "-0.5px",
    margin: 0,
    marginBottom: spacing.xs + 2,
  },
  subtitle: {
    fontSize: typography.size.xs,
    letterSpacing: "0.15em",
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    marginBottom: spacing["2xl"],
  },
  bottomNotice: {
    marginTop: spacing.xl,
    background: colors.bg.overlay,
    backdropFilter: "blur(10px)",
    borderRadius: radius.xl,
    padding: `${spacing.sm + 2}px ${spacing.xl - 4}px`,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    boxShadow: shadow.sm,
  },
  noticeDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    background: colors.brand.accent,
    display: "inline-block",
    flexShrink: 0,
  },
};
