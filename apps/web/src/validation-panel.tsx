import type { ValidationIssue, ValidationResult } from "@skill-library/domain";

export interface ValidationPanelProps {
  validation?: ValidationResult;
  emptyMessage?: string;
}

export function ValidationPanel({ validation, emptyMessage = "No validation results yet." }: ValidationPanelProps) {
  if (!validation) {
    return <p className="validation-copy">{emptyMessage}</p>;
  }

  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");

  return (
    <div className="validation-panel">
      <p className={`validation-summary ${validation.ok ? "validation-summary-ok" : "validation-summary-error"}`}>
        {validation.ok
          ? errors.length === 0 && warnings.length === 0
            ? "Package shape is valid. SKILL.md frontmatter and bundled files look good."
            : "Package passed validation with warnings."
          : "Validation found blocking errors."}
      </p>
      {errors.length > 0 ? <ValidationIssueGroup title="Errors" issues={errors} className="validation-errors" /> : null}
      {warnings.length > 0 ? <ValidationIssueGroup title="Warnings" issues={warnings} className="validation-warnings" /> : null}
    </div>
  );
}

function ValidationIssueGroup({
  title,
  issues,
  className
}: {
  title: string;
  issues: ValidationIssue[];
  className: string;
}) {
  return (
    <div className={className}>
      <div className="validation-group-title">{title}</div>
      <ul className="validation-issue-list">
        {issues.map((issue) => (
          <li key={`${issue.ruleId}:${issue.path ?? ""}:${issue.message}`} className="validation-issue">
            <code className="validation-rule-id">{issue.ruleId}</code>
            <span>{issue.message}</span>
            {issue.path ? <span className="validation-issue-path">{issue.path}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
