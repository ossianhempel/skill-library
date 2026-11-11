import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LifecycleState, SkillVersion } from "@skill-library/domain";
import {
  readSkillDescription,
  readSkillName,
  type PackageTreeEntry,
} from "@skill-library/validation";
import { hasRole } from "../auth.js";
import { stableId } from "../index.js";
import { fail, ok } from "./format.js";
import { skillOwner } from "../proposals.js";
import { registerProposalTools } from "./proposal-tools.js";
import { findSkill, type McpToolContext } from "./skills.js";

const PENDING: LifecycleState[] = ["draft", "published"];

/**
 * Sharing skills: anyone can submit a skill (it lands as a draft, as with an
 * upload in the web app); maintainers also get the review queue and can
 * approve, hide or deprecate versions. Only maintainers see those two tools.
 */
export function registerPublishTools(server: McpServer, ctx: McpToolContext) {
  server.registerTool(
    "skills_publish",
    {
      title: "Share a skill",
      description: [
        "Submit a skill to the library: a new one, a new version of the person's own skill, or a proposed change to someone else's skill (its owner approves it). Show the person what will be shared first.",
        "Pass every file of the skill folder. SKILL.md is required, with frontmatter `name` (lowercase-with-dashes, becomes the slug) and `description`.",
        "The skill is saved as a draft; a maintainer approves it before colleagues see it. Validation problems come back as a list to fix.",
        "Before calling, show the person what will be shared and get their OK.",
      ].join("\n"),
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z
                .string()
                .min(1)
                .describe(
                  'Relative to the skill folder, e.g. "SKILL.md" or "references/rules.md".'
                ),
              content: z.string(),
              encoding: z
                .enum(["utf8", "base64"])
                .default("utf8")
                .describe("base64 for binary files."),
            })
          )
          .min(1),
        display_name: z
          .string()
          .optional()
          .describe(
            "Name shown in the library. Defaults to the SKILL.md name."
          ),
        version: z
          .string()
          .optional()
          .describe(
            "Defaults to 1.0.0 for a new skill, else the next patch version."
          ),
        categories: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ files, display_name, version, categories }) => {
      const skillMd = files.find(
        (file) => file.path.replace(/^\.?\//, "") === "SKILL.md"
      );
      const skillMdText =
        skillMd &&
        Buffer.from(
          skillMd.content,
          skillMd.encoding === "base64" ? "base64" : "utf8"
        ).toString("utf8");
      const slug = skillMdText && readSkillName(skillMdText);
      const description = skillMdText && readSkillDescription(skillMdText);

      if (!slug || !description) {
        return fail(
          "SKILL.md at the top of the skill folder must start with frontmatter that has `name` (lowercase letters, digits and dashes) and `description`."
        );
      }

      const packageId = stableId(ctx.workspaceId, slug);
      const existing = await ctx.api.packageVersions(packageId);
      const owner = skillOwner(existing);
      const proposing =
        owner !== undefined &&
        owner.id !== ctx.user.id &&
        !hasRole(ctx.user, "maintainer");

      const nextVersion = version ?? nextPatch(existing);

      if (existing.some((item) => item.version === nextVersion)) {
        return fail(
          `Version ${nextVersion} of ${slug} already exists. Pass a higher version.`
        );
      }

      const created = await ctx.api.createUploadedVersion({
        workspaceId: ctx.workspaceId,
        packageSlug: slug,
        packageName: display_name?.trim() || slug,
        description,
        categories,
        version: nextVersion,
        entries: files.map(
          (file): PackageTreeEntry => ({
            path: file.path.replace(/^\.?\//, ""),
            content: file.content,
            encoding: file.encoding,
          })
        ),
        actorId: ctx.user.id,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
      });

      if (!created.validation.ok) {
        return fail(
          [
            `Saved ${slug} ${nextVersion} as a draft, but it does not pass validation, so it cannot be approved. Fix these and publish again with a new version:`,
            ...created.validation.issues.map(
              (issue) =>
                `- [${issue.severity}] ${issue.path ? `${issue.path}: ` : ""}${issue.message}`
            ),
          ].join("\n")
        );
      }

      const skillUrl = `${ctx.baseUrl}/s/${encodeURIComponent(ctx.workspaceId)}/${encodeURIComponent(slug)}`;
      const warnings = created.validation.issues.filter(
        (issue) => issue.severity === "warning"
      );
      return ok(
        [
          proposing
            ? `Sent ${slug} ${nextVersion} to ${owner.name ?? "the skill's owner"} as a proposed change. They (or a maintainer) approve or reject it; until then colleagues keep getting the current version. Follow it at ${skillUrl}.`
            : `Submitted ${slug} ${nextVersion} as a draft. A maintainer reviews and approves it before colleagues can find it; the person can follow it at ${skillUrl}.`,
          ...(warnings.length
            ? [
                "",
                "Warnings worth fixing:",
                ...warnings.map((issue) => `- ${issue.message}`),
              ]
            : []),
        ].join("\n")
      );
    }
  );

  registerProposalTools(server, ctx);

  if (!hasRole(ctx.user, "maintainer")) {
    return;
  }

  server.registerTool(
    "skills_review_queue",
    {
      title: "Skills waiting for review",
      description:
        "Maintainers: versions submitted but not approved yet (draft or published), newest first, with validation status. Read one with skills_get, passing its version.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const snapshot = await ctx.api.workspaceCatalog(ctx.workspaceId);
      const pending = snapshot.packages.flatMap((pkg) =>
        (snapshot.versionsByPackage.get(pkg.id) ?? [])
          .filter((item) => PENDING.includes(item.lifecycleState))
          .map((item) => ({ pkg, version: item }))
      );
      pending.sort((a, b) =>
        b.version.createdAt.localeCompare(a.version.createdAt)
      );

      if (pending.length === 0) return ok("Nothing is waiting for review.");
      return ok(
        pending
          .map(
            ({ pkg, version }) =>
              `- ${pkg.name} (\`${pkg.slug}\`) ${version.version}: ${version.lifecycleState}, by ${version.provenance.actorName ?? "unknown"}, ${version.createdAt.slice(0, 10)}, ${version.validation.ok ? "valid" : "INVALID"}`
          )
          .join("\n")
      );
    }
  );

  server.registerTool(
    "skills_set_status",
    {
      title: "Approve, hide or deprecate a skill version",
      description:
        "Maintainers: change a version's status. approved = colleagues can find and install it; hidden = taken out of the catalog; deprecated = marked as replaced. Read the version with skills_get (pass its version) before approving it.",
      inputSchema: {
        skill: z.string().min(1),
        version: z
          .string()
          .optional()
          .describe("Defaults to the newest version."),
        status: z.enum([
          "approved",
          "published",
          "hidden",
          "deprecated",
          "draft",
        ]),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ skill, version, status }) => {
      const snapshot = await ctx.api.workspaceCatalog(ctx.workspaceId);
      const entries = snapshot.packages.map((pkg) => ({
        package: pkg,
        stats: {
          packageId: pkg.id,
          downloads: 0,
          downloadHistory: [],
          lastModifiedAt: pkg.updatedAt,
        },
      }));
      const match = findSkill(entries, skill);
      if (!("entry" in match)) return fail(`No skill called "${skill}".`);
      const versions =
        snapshot.versionsByPackage.get(match.entry.package.id) ?? [];
      const target = version
        ? versions.find((item) => item.version === version)
        : versions[0];
      if (!target)
        return fail(
          `${match.entry.package.slug} has no version ${version}. Versions: ${versions.map((item) => item.version).join(", ")}`
        );

      try {
        const updated = await ctx.api.transitionVersion({
          versionId: target.id,
          toState: status,
          actorId: ctx.user.id,
        });
        return ok(
          `${match.entry.package.slug} ${target.version} is now ${updated?.lifecycleState ?? status}.`
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "skills_delete",
    {
      title: "Delete a skill",
      description: [
        "Maintainers: permanently delete a skill with all its versions, votes and usage history. It cannot be undone.",
        "Pass the exact slug. Tell the person what will be deleted and get their OK first. To only take a skill out of the catalog, use skills_set_status with hidden instead.",
      ].join("\n"),
      inputSchema: {
        skill: z.string().min(1).describe('The exact slug, e.g. "docx".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ skill }) => {
      const { packages } = await ctx.api.workspaceCatalog(ctx.workspaceId);
      const pkg = packages.find((item) => item.slug === skill.trim());
      if (!pkg)
        return fail(
          `No skill with the slug "${skill}". Slugs: ${packages.map((item) => item.slug).join(", ")}`
        );

      const deleted = await ctx.api.deletePackage(pkg.id);
      return deleted
        ? ok(`${pkg.name} (\`${pkg.slug}\`) is deleted.`)
        : fail(`${pkg.slug} was already gone.`);
    }
  );
}

function nextPatch(existing: SkillVersion[]): string {
  const highest = existing
    .map((item) => item.version.match(/^(\d+)\.(\d+)\.(\d+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(
      (match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const
    )
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];

  return highest ? `${highest[0]}.${highest[1]}.${highest[2] + 1}` : "1.0.0";
}
