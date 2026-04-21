import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";

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
      const response = await fetch("/api/auth/google", {
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

      const meRes = await fetch("/api/auth/me", {
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
        <button style={s.moonBtn}>🌙</button>

        {/* Card */}
        <div style={s.card}>
          {/* Logo */}
          <div style={s.logoWrap}>
            <div style={s.logoCircle}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </div>

          <h1 style={s.title}>Crowd Map</h1>
          <p style={s.subtitle}>SEOUL POPULATION DENSITY</p>

          {/* 💡 기존 커스텀 버튼을 구글 공식 버튼으로 교체 */}
          <div style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: "8px" }}>
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
          <span style={s.noticeDot}>●</span>
          서울의 모든 순간을 인구 밀도로 지금 바로 파악해 보세요
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

// 기존에 작성하신 스타일 코드 (그대로 유지)
const s: Record<string, CSSProperties> = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #d6edfb 0%, #e4f3fc 50%, #edf8ff 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    padding: "20px 16px",
    position: "relative",
  },
  moonBtn: {
    position: "fixed",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.8)",
    border: "none",
    borderRadius: "50%",
    width: 40,
    height: 40,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 2px 12px rgba(33,150,243,0.15)",
    backdropFilter: "blur(8px)",
    zIndex: 100,
  },
  card: {
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(20px)",
    borderRadius: 28,
    padding: "44px 36px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 20px 60px rgba(33,150,243,0.12), 0 0 0 1px rgba(255,255,255,0.9) inset",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },
  logoWrap: {
    marginBottom: 18,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #e3f2fd, #bbdefb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 20px rgba(33,150,243,0.20)",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1a2a3a",
    letterSpacing: "-0.5px",
    margin: 0,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 11,
    letterSpacing: "0.15em",
    color: "#90aac0",
    fontWeight: 500,
    marginBottom: 32,
  },
  bottomNotice: {
    marginTop: 24,
    background: "rgba(255,255,255,0.75)",
    backdropFilter: "blur(10px)",
    borderRadius: 20,
    padding: "10px 20px",
    fontSize: 12,
    color: "#5a7a90",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 2px 12px rgba(33,150,243,0.08)",
  },
  noticeDot: {
    color: "#2196f3",
    fontSize: 8,
  },
};