import { Loader2, Shield } from "lucide-react";
import type { RegistryBrandingConfig } from "@skill-library/domain";

export function LoginScreen({
  branding,
  onSignIn,
  signingIn = false,
  checkingSession = false,
}: {
  branding: RegistryBrandingConfig;
  onSignIn: () => void;
  signingIn?: boolean;
  checkingSession?: boolean;
}) {
  const busy = signingIn || checkingSession;
  const statusCopy = checkingSession
    ? "Checking your sign-in…"
    : "Redirecting to Microsoft…";

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="mark" style={{ margin: "0 auto 20px" }}>
          {branding.appShortName}
        </div>
        <h1
          style={{
            fontSize: "2.2rem",
            textAlign: "center",
            marginBottom: "8px",
          }}
        >
          {branding.appName}
        </h1>
        <p
          style={{
            textAlign: "center",
            maxWidth: "360px",
            margin: "0 auto 8px",
            color: "var(--muted)",
            fontSize: "0.92rem",
          }}
        >
          {branding.registryTagline}
        </p>
        <p
          style={{
            textAlign: "center",
            maxWidth: "360px",
            margin: "0 auto 32px",
          }}
        >
          {branding.loginSubtitle}
        </p>
        {busy ? (
          <div className="login-loading" role="status" aria-live="polite">
            <Loader2 size={28} className="login-spinner" aria-hidden="true" />
            <p>{statusCopy}</p>
          </div>
        ) : (
          <button className="login-btn" onClick={onSignIn}>
            <Shield size={18} />
            Sign in with Microsoft
          </button>
        )}
      </div>
    </main>
  );
}
