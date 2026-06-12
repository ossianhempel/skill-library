import type { DownloadHistoryPoint } from "@skill-library/domain";

export function formatSkillDate(iso: string): string {
  if (!iso || iso === new Date(0).toISOString()) {
    return "—";
  }

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DownloadSparkline({
  history,
  width = 72,
  height = 24,
  label = "Download trend",
}: {
  history: DownloadHistoryPoint[];
  width?: number;
  height?: number;
  label?: string;
}) {
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
      aria-label={label}
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
  updatedAt,
  lastModifiedAt,
  compact = false,
}: {
  version?: string;
  downloads: number;
  downloadHistory: DownloadHistoryPoint[];
  updatedAt: string;
  lastModifiedAt: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "skill-stats skill-stats--compact" : "skill-stats"}
    >
      <span className="skill-stat">
        <em>Version</em>
        <strong>{version ?? "—"}</strong>
      </span>
      <span className="skill-stat">
        <em>Downloads</em>
        <strong>{downloads}</strong>
      </span>
      <span className="skill-stat">
        <em>Updated</em>
        <strong>{formatSkillDate(updatedAt)}</strong>
      </span>
      <span className="skill-stat">
        <em>Last modified</em>
        <strong>{formatSkillDate(lastModifiedAt)}</strong>
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
