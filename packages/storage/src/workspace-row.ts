import type { Workspace } from "@skill-library/domain";

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  logo_url?: string | null;
  reporting_policy: Workspace["reportingPolicy"];
  visibility: Workspace["visibility"];
}

export function fromWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url ?? undefined,
    reportingPolicy: row.reporting_policy,
    visibility: row.visibility,
  };
}
