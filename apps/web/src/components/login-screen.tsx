import { Loader2, Shield } from "lucide-react";
import type { RegistryBrandingConfig } from "@skill-library/domain";
import { LogoMark } from "./logo-mark.js";
import { useI18n } from "../i18n/locale.js";
import { LanguageSwitcher } from "../i18n/language-switcher.js";

export function LoginScreen({
  branding,
  logoUrl,
  onSignIn,
  signingIn = false,
  checkingSession = false,
}: {
  branding: RegistryBrandingConfig;
  logoUrl?: string;
  onSignIn: () => void;
  signingIn?: boolean;
  checkingSession?: boolean;
}) {
  const { t } = useI18n();
  const busy = signingIn || checkingSession;
  const statusCopy = checkingSession ? t.login.checking : t.login.redirecting;

  return (
    <main className="login-shell">
      <LanguageSwitcher className="login-language" />
      <div className="login-card">
        <LogoMark
          logoUrl={logoUrl}
          fallbackText={branding.appShortName}
          className="mark login-mark"
        />
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
            {t.login.signIn}
          </button>
        )}
      </div>
    </main>
  );
}
