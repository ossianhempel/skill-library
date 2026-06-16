import { BarChart3 } from "lucide-react";
import type { CatalogSkill } from "../types.js";
import { summarizeReports } from "../api/catalog.js";
import { Metric } from "./chrome.js";

export function ReportPanel({
  catalog,
  summary,
}: {
  catalog: CatalogSkill[];
  summary: ReturnType<typeof summarizeReports>;
}) {
  return (
    <section className="report-panel">
      <div className="panel-title">
        <BarChart3 size={17} />
        Adoption report
      </div>
      <div className="report-grid">
        <Metric label="Packages" value={summary.packages} />
        <Metric label="Current" value={summary.currentInstalls} />
        <Metric
          label="Needs update"
          value={summary.staleInstalls}
          tone="warn"
        />
      </div>
      <div className="report-table" role="table" aria-label="Package reports">
        {catalog.map((skill) => (
          <div className="report-row" role="row" key={skill.pkg.id}>
            <span>{skill.pkg.name}</span>
            <strong>{skill.installs} installs</strong>
            <em>{skill.staleInstalls} stale</em>
          </div>
        ))}
      </div>
    </section>
  );
}
