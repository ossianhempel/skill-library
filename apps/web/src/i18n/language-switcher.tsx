import { useId } from "react";
import { SUPPORTED_LOCALES, useI18n, type Locale } from "./locale.js";

/**
 * Flag buttons for switching the UI language. Flags are inline SVG because
 * flag emoji render as plain letters on Windows.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={["language-switcher", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={t.language.label}
    >
      {SUPPORTED_LOCALES.map((option) => (
        <button
          key={option.id}
          type="button"
          lang={option.id}
          className={`language-option ${locale === option.id ? "active" : ""}`}
          aria-pressed={locale === option.id}
          aria-label={option.name}
          title={t.language.switchTo(option.name)}
          onClick={() => setLocale(option.id)}
        >
          <Flag locale={option.id} />
          <span aria-hidden="true">{option.id.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

function Flag({ locale }: { locale: Locale }) {
  return locale === "sv" ? <SwedishFlag /> : <BritishFlag />;
}

function SwedishFlag() {
  return (
    <svg
      className="flag"
      viewBox="0 0 16 10"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="16" height="10" fill="#006aa7" />
      <rect x="5" width="2" height="10" fill="#fecc00" />
      <rect y="4" width="16" height="2" fill="#fecc00" />
    </svg>
  );
}

function BritishFlag() {
  // Clip ids must be unique when the switcher renders more than once.
  const clipId = `flag-gb-${useId().replace(/[^\w-]/g, "")}`;

  return (
    <svg
      className="flag"
      viewBox="0 0 60 30"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <clipPath id={clipId}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath={`url(#${clipId})`}
        stroke="#c8102e"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}
