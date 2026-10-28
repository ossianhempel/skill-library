import type { DownloadHistoryPoint } from "@skill-library/domain";
import { useI18n } from "./i18n/locale.js";

export function formatSkillDate(iso: string, locale = "en-US"): string {
  if (!iso || iso === new Date(0).toISOString()) {
    return "—";
  }

  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DownloadSparkline({
  history,
  width = 72,
  height = 24,
  label,
}: {
  history: DownloadHistoryPoint[];
  width?: number;
  height?: number;
  label?: string;
}) {
  const { t } = useI18n();
  const values = history.map((point) => point.count);
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : width / 2;
      const y = height - (value / max) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="download-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? t.stats.downloadTrend}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function SkillStatsMeta({
  version,
  downloads,
  downloadHistory,
  uploadedAt,
  lastModifiedAt,
  author,
  compact = false,
}: {
  version?: string;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  uploadedAt: string;
  lastModifiedAt: string;
  author?: string;
  compact?: boolean;
}) {
  const { t, dateLocale } = useI18n();
  return (
    <div
      className={compact ? "skill-stats skill-stats--compact" : "skill-stats"}
    >
      <span className="skill-stat">
        <em>{t.stats.version}</em>
        <strong>{version ?? "—"}</strong>
      </span>
      {author && (
        <span className="skill-stat">
          <em>{t.stats.author}</em>
          <strong>{author}</strong>
        </span>
      )}
      <span className="skill-stat">
        <em>{t.stats.downloads}</em>
        <strong>{downloads}</strong>
      </span>
      {!compact && (
        <span className="skill-stat">
          <em>{t.stats.uploaded}</em>
          <strong>{formatSkillDate(uploadedAt, dateLocale)}</strong>
        </span>
      )}
      <span className="skill-stat">
        <em>{t.stats.lastModified}</em>
        <strong>{formatSkillDate(lastModifiedAt, dateLocale)}</strong>
      </span>
      <span
        className="skill-stat skill-stat--sparkline"
        aria-hidden={downloadHistory.every((point) => point.count === 0)}
      >
        <DownloadSparkline history={downloadHistory} />
      </span>
    </div>
  );
}
