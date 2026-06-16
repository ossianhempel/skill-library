import type { ReactNode } from "react";
import type {
  LifecycleState,
  RegistryBrandingConfig,
} from "@skill-library/domain";

export function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "active" : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className={tone === "warn" ? "metric warn" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function LifecycleBadge({ state }: { state: LifecycleState }) {
  return <span className={`badge ${state}`}>{state}</span>;
}

export function StatusStyles({
  branding,
}: {
  branding: RegistryBrandingConfig;
}) {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      :root {
        --status-draft: ${branding.statusDraftBg || "#52525b"};
        --status-draft-text: ${branding.statusDraftText || "#f4f4f5"};
        --status-draft-border: ${branding.statusDraftBorder || "#71717a"};

        --status-approved: ${branding.statusApprovedBg || "#166534"};
        --status-approved-text: ${branding.statusApprovedText || "#f0fdf4"};
        --status-approved-border: ${branding.statusApprovedBorder || "#15803d"};

        --status-published: ${branding.statusPublishedBg || "#854d0e"};
        --status-published-text: ${branding.statusPublishedText || "#fef9c3"};
        --status-published-border: ${branding.statusPublishedBorder || "#a16207"};

        --status-hidden: ${branding.statusHiddenBg || "#3730a3"};
        --status-hidden-text: ${branding.statusHiddenText || "#e0e7ff"};
        --status-hidden-border: ${branding.statusHiddenBorder || "#4338ca"};

        --status-deprecated: ${branding.statusDeprecatedBg || "#991b1b"};
        --status-deprecated-text: ${branding.statusDeprecatedText || "#fee2e2"};
        --status-deprecated-border: ${branding.statusDeprecatedBorder || "#b91c1c"};
      }
    `,
      }}
    />
  );
}
