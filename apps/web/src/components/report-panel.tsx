import { BarChart3 } from "lucide-react";
import type { CatalogSkill } from "../types.js";
import { summarizeReports } from "../api/catalog.js";
import { Metric } from "./chrome.js";
import { useI18n } from "../i18n/locale.js";

export function ReportPanel({
  catalog,
  summary,
}: {
  catalog: CatalogSkill[];
  summary: ReturnType<typeof summarizeReports>;
}) {
  const { t } = useI18n();
  return (
    <section className="report-panel">
      <div className="panel-title">
        <BarChart3 size={17} />
        {t.reports.title}
      </div>
      <div className="report-grid">
        <Metric label={t.reports.packages} value={summary.packages} />
        <Metric label={t.reports.current} value={summary.currentInstalls} />
        <Metric
          label={t.reports.needsUpdate}
          value={summary.staleInstalls}
          tone="warn"
        />
      </div>
      <div
        className="report-table"
        role="table"
        aria-label={t.reports.tableAria}
      >
        {catalog.map((skill) => (
          <div className="report-row" role="row" key={skill.pkg.id}>
            <span>{skill.pkg.name}</span>
            <strong>{t.reports.installs(skill.installs)}</strong>
            <em>{t.reports.stale(skill.staleInstalls)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}
