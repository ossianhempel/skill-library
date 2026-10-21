import { normalizeLogoUrlInput, type Workspace } from "@skill-library/domain";

export type WorkspaceSettingsResult =
  | {
      ok: true;
      value: {
        reportingPolicy?: Workspace["reportingPolicy"];
        visibility?: Workspace["visibility"];
        logoUrl?: string;
      };
    }
  | { ok: false; error: string };

export function parseWorkspaceSettings(
  input: unknown
): WorkspaceSettingsResult {
  const body = (input ?? {}) as {
    reportingPolicy?: string;
    visibility?: string;
    logoUrl?: unknown;
  };
  const reportingPolicy = parseReportingPolicy(body.reportingPolicy);
  const visibility = parseVisibility(body.visibility);
  const logo = normalizeLogoUrlInput(body.logoUrl);

  if (!logo.ok) {
    return { ok: false, error: logo.error };
  }

  if (
    (body.reportingPolicy && !reportingPolicy) ||
    (body.visibility && !visibility)
  ) {
    return {
      ok: false,
      error: "Request body includes invalid workspace settings.",
    };
  }

  return {
    ok: true,
    value: { reportingPolicy, visibility, logoUrl: logo.value },
  };
}

function parseReportingPolicy(
  value: string | undefined
): Workspace["reportingPolicy"] | undefined {
  if (value === "disabled" || value === "opt-in" || value === "required") {
    return value;
  }

  return undefined;
}

function parseVisibility(
  value: string | undefined
): Workspace["visibility"] | undefined {
  if (value === "public" || value === "private") {
    return value;
  }

  return undefined;
}
