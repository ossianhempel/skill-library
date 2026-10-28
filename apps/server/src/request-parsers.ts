import type { LifecycleState } from "@skill-library/domain";
import type { PackageTreeEntry } from "@skill-library/validation";

export function parseUsageEventType(value: string | undefined) {
  return value === "view" || value === "download" ? value : undefined;
}

export function parseLifecycleState(
  value: string | undefined
): LifecycleState | undefined {
  if (
    value === "draft" ||
    value === "published" ||
    value === "approved" ||
    value === "hidden" ||
    value === "deprecated"
  ) {
    return value;
  }

  return undefined;
}

export async function parsePackageTreeBody(
  request: Request
): Promise<{ entries: PackageTreeEntry[] }> {
  const body = (await request.json()) as { entries?: PackageTreeEntry[] };

  if (!Array.isArray(body.entries)) {
    throw new Error("Request body must include entries.");
  }

  return { entries: body.entries };
}
