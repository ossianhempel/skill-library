import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SkillPackage, SkillVersion } from "@skill-library/domain";
import { isProposal, mayDecide, skillOwner } from "../proposals.js";
import { fail, ok } from "./format.js";
import type { McpToolContext } from "./skills.js";

interface ProposalRow {
  pkg: SkillPackage;
  version: SkillVersion;
  ownerName?: string;
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
    },
    async () => {
      const { forMe, fromMe } = await listProposals(ctx);

      if (forMe.length === 0 && fromMe.length === 0) {
        return ok("No proposed changes are waiting.");
      }

      return ok(
        [
          forMe.length
            ? `Waiting for your decision:\n${forMe.map(line).join("\n")}`
            : "Nothing waits for your decision.",
          ...(fromMe.length
            ? ["", `You proposed:\n${fromMe.map(line).join("\n")}`]
            : []),
        ].join("\n")
      );
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
        return ok(
          decision === "approve"
            ? `Approved: ${row.pkg.slug} ${row.version.version} by ${row.version.provenance.actorName ?? "a colleague"} is now the version everyone gets.`
            : `Rejected ${row.pkg.slug} ${row.version.version}. Colleagues keep the current version.`
        );
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

    for (const version of versions.filter((item) => isProposal(item, owner))) {
      const row = { pkg, version, ownerName: owner?.name };
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
