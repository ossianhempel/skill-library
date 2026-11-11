import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SkillPackage, SkillVersion } from "@skill-library/domain";
import { isProposal, mayDecide, skillOwner } from "../proposals.js";
import { diffSkillFiles } from "./diff.js";
import { fail, ok } from "./format.js";
import { readSkillFiles, type McpToolContext } from "./skills.js";
import { VIEW_TOOL_META, withView, type ProposalCard } from "./views.js";

/** Proposals shown with their changes in the view; the rest list without. */
const MAX_DIFFED = 5;

interface ProposalRow {
  pkg: SkillPackage;
  version: SkillVersion;
  ownerName?: string;
  /** The version colleagues get today, which the proposal would replace. */
  current?: SkillVersion;
}

/**
 * Proposed changes: when someone publishes a new version of a skill another
 * person owns, the owner approves or rejects it. Everyone gets these tools,
 * because anyone can own a skill.
 */
export function registerProposalTools(server: McpServer, ctx: McpToolContext) {
  server.registerTool(
    "skills_proposals",
    {
      title: "Proposed changes to skills",
      description:
        "Changes colleagues proposed to the person's own skills, waiting for their decision, and changes the person proposed to others' skills. Read one with skills_get (pass its version), then decide with skills_review_proposal.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: VIEW_TOOL_META,
    },
    async () => {
      const { forMe, fromMe } = await listProposals(ctx);

      if (forMe.length === 0 && fromMe.length === 0) {
        return ok("No proposed changes are waiting.");
      }

      const text = ok(
        [
          forMe.length
            ? `Waiting for your decision:\n${forMe.map(line).join("\n")}`
            : "Nothing waits for your decision.",
          ...(fromMe.length
            ? ["", `You proposed:\n${fromMe.map(line).join("\n")}`]
            : []),
        ].join("\n")
      );
      return withView(text, {
        kind: "proposals",
        forMe: await Promise.all(
          forMe.map((row, index) => card(ctx, row, index < MAX_DIFFED))
        ),
        fromMe: await Promise.all(fromMe.map((row) => card(ctx, row, false))),
      });
    }
  );

  server.registerTool(
    "skills_review_proposal",
    {
      title: "Approve or reject a proposed change",
      description:
        "For a skill the person owns: approve a change a colleague proposed (it becomes the version everyone gets) or reject it. Read it with skills_get first and confirm the decision with the person.",
      inputSchema: {
        skill: z.string().min(1),
        version: z.string().min(1).describe("The proposed version."),
        decision: z.enum(["approve", "reject"]),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ skill, version, decision }) => {
      const { forMe } = await listProposals(ctx, true);
      const wanted = skill.trim().toLowerCase();
      const row = forMe.find(
        (item) =>
          item.version.version === version &&
          (item.pkg.slug === wanted || item.pkg.name.toLowerCase() === wanted)
      );

      if (!row) {
        return fail(
          `No proposal ${version} for "${skill}" waits for your decision. See skills_proposals.`
        );
      }

      try {
        await ctx.api.transitionVersion({
          versionId: row.version.id,
          toState: decision === "approve" ? "approved" : "hidden",
          actorId: ctx.user.id,
        });
        const done = ok(
          decision === "approve"
            ? `Approved: ${row.pkg.slug} ${row.version.version} by ${row.version.provenance.actorName ?? "a colleague"} is now the version everyone gets.`
            : `Rejected ${row.pkg.slug} ${row.version.version}. Colleagues keep the current version.`
        );
        return withView(done, {
          kind: "review",
          slug: row.pkg.slug,
          version: row.version.version,
          decision,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );
}

/**
 * Proposals the person may decide on (as owner, or as a maintainer when
 * `includeAsMaintainer`), and the ones they sent.
 */
async function listProposals(ctx: McpToolContext, includeAsMaintainer = false) {
  const snapshot = await ctx.api.workspaceCatalog(ctx.workspaceId);
  const forMe: ProposalRow[] = [];
  const fromMe: ProposalRow[] = [];

  for (const pkg of snapshot.packages) {
    const versions = snapshot.versionsByPackage.get(pkg.id) ?? [];
    const owner = skillOwner(versions);
    const current = versions
      .filter((item) => item.lifecycleState === "approved")
      .sort((a, b) =>
        (b.approvedAt ?? b.createdAt).localeCompare(a.approvedAt ?? a.createdAt)
      )[0];

    for (const version of versions.filter((item) => isProposal(item, owner))) {
      const row = { pkg, version, ownerName: owner?.name, current };
      const decides =
        owner?.id === ctx.user.id ||
        (includeAsMaintainer &&
          mayDecide(ctx.user, version, versions, "approved"));
      if (decides) forMe.push(row);
      else if (version.provenance.actorId === ctx.user.id) fromMe.push(row);
    }
  }

  return { forMe, fromMe };
}

function line({ pkg, version, ownerName }: ProposalRow): string {
  return `- ${pkg.name} (\`${pkg.slug}\`) ${version.version} by ${version.provenance.actorName ?? "unknown"}, ${version.createdAt.slice(0, 10)}${ownerName ? `, owner ${ownerName}` : ""}${version.validation.ok ? "" : ", INVALID"}`;
}

/** A proposal for the view, with its changes against the current version. */
async function card(
  ctx: McpToolContext,
  { pkg, version, ownerName, current }: ProposalRow,
  withDiff: boolean
): Promise<ProposalCard> {
  const base: ProposalCard = {
    slug: pkg.slug,
    name: pkg.name,
    version: version.version,
    author: version.provenance.actorName,
    createdAt: version.createdAt,
    owner: ownerName,
    valid: version.validation.ok,
    currentVersion: current?.version,
    url: `${ctx.baseUrl}/s/${encodeURIComponent(ctx.workspaceId)}/${encodeURIComponent(pkg.slug)}`,
  };
  if (!withDiff) return base;

  try {
    const [before, after] = await Promise.all([
      current ? readSkillFiles(ctx, { package: pkg }, current) : { files: [] },
      readSkillFiles(ctx, { package: pkg }, version),
    ]);
    return { ...base, files: diffSkillFiles(before.files, after.files) };
  } catch {
    // Missing files in storage: show the proposal without its changes.
    return base;
  }
}
