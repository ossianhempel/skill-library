import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  SkillVersion,
  WorkspaceCatalogEntry,
} from "@skill-library/domain";
import { castSkillVote } from "../ranking-routes.js";
import { registerPublishTools } from "./publish-tools.js";
import {
  claudeAppDownloadUrl,
  findSkill,
  loadCatalog,
  matchSkills,
  readSkillFiles,
  skillPageUrl,
  sortSkills,
  versionFor,
  type McpToolContext,
  type SkillFile,
} from "./skills.js";
import { fail, ok, skillLine } from "./format.js";
import { mayReadVersion } from "../proposals.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
/** Inline install payloads stay below this; bigger skills go by download link. */
const INLINE_INSTALL_LIMIT = 400_000;

export const INSTALL_CLIENTS = [
  "claude-app",
  "claude-code",
  "codex",
  "project",
] as const;
type InstallClient = (typeof INSTALL_CLIENTS)[number];

const SKILLS_DIR: Record<Exclude<InstallClient, "claude-app">, string> = {
  "claude-code": "~/.claude/skills",
  codex: "~/.codex/skills",
  project: ".agents/skills",
};

const skillArg = z
  .string()
  .min(1)
  .describe(
    'The skill\'s slug or name as skills_search shows it, e.g. "rebtech-cv-tailor".'
  );

const versionArg = z
  .string()
  .optional()
  .describe(
    "A specific version, e.g. a draft to review. Leave out for the version colleagues get."
  );

export function registerSkillTools(server: McpServer, ctx: McpToolContext) {
  server.registerTool(
    "skills_search",
    {
      title: "Search skills",
      description:
        "Find skills in the library. Every word of the query must match the skill's name, description or category. Leave the query empty to list all skills. Returns slug, name, description, version, author and how many colleagues use it. Next: skills_get to read one.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Words to look for, e.g. "cv" or "sql review".'),
        sort: z.enum(["popular", "newest", "name"]).default("popular"),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ_ONLY,
    },
    async ({ query, sort, limit, offset }) => {
      const { entries } = await loadCatalog(ctx);
      const matches = sortSkills(matchSkills(entries, query), sort);
      const page = matches.slice(offset, offset + limit);
      const more = offset + page.length < matches.length;

      if (matches.length === 0) {
        return ok(
          query
            ? `No skills match "${query}". Try fewer or other words, or call skills_search without a query to see everything (${entries.length} skills).`
            : "The library has no skills yet."
        );
      }

      return ok(
        [
          `${matches.length} skill(s)${query ? ` matching "${query}"` : ""}, showing ${offset + 1}-${offset + page.length}:`,
          "",
          ...page.map((entry) => skillLine(entry, ctx.user)),
          ...(more
            ? ["", `More: call again with offset ${offset + page.length}.`]
            : []),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "skills_get",
    {
      title: "Read a skill",
      description:
        "Read a skill: what it does, who made it, its full SKILL.md instructions and the list of its other files. To use the skill right away, follow the SKILL.md and fetch any file it refers to with skills_read_file. To keep it for later conversations, call skills_install.",
      inputSchema: { skill: skillArg, version: versionArg },
      annotations: READ_ONLY,
    },
    async ({ skill, version: requested }) => {
      const found = await resolve(ctx, skill, requested);
      if ("error" in found) return found.error;
      const { entry, version } = found;
      const { folder, files } = await readSkillFiles(ctx, entry, version);
      await ctx.api.recordPackageView(entry.package.id);
      const skillMd = files.find((file) => file.path === "SKILL.md");
      const others = files.filter((file) => file.path !== "SKILL.md");

      return ok(
        [
          skillLine(entry, ctx.user),
          `Page: ${skillPageUrl(ctx, entry)}`,
          `Installs as folder: ${folder}`,
          "",
          others.length
            ? `Other files (read with skills_read_file):\n${others.map((file) => `- ${file.path} (${formatSize(file.size)}${file.text === undefined ? ", binary" : ""})`).join("\n")}`
            : "No other files.",
          "",
          "--- SKILL.md ---",
          skillMd?.text ?? "(SKILL.md is not text)",
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "skills_read_file",
    {
      title: "Read a file in a skill",
      description:
        'Read one file of a skill, such as a reference, template or script that its SKILL.md mentions. Paths are relative to the skill folder, e.g. "references/writing-rules.md".',
      inputSchema: {
        skill: skillArg,
        path: z
          .string()
          .min(1)
          .describe("File path inside the skill, as skills_get lists it."),
        version: versionArg,
      },
      annotations: READ_ONLY,
    },
    async ({ skill, path, version: requested }) => {
      const found = await resolve(ctx, skill, requested);
      if ("error" in found) return found.error;
      const { files } = await readSkillFiles(ctx, found.entry, found.version);
      const wanted = path.replace(/^\.?\//, "");
      const file = files.find((item) => item.path === wanted);

      if (!file) {
        return fail(
          `${found.entry.package.slug} has no file "${path}". Its files: ${files.map((item) => item.path).join(", ")}`
        );
      }

      if (file.text === undefined) {
        if (file.size > INLINE_INSTALL_LIMIT) {
          return fail(
            `${file.path} is a binary file (${formatSize(file.size)}), too large to send. To get it, install the skill with skills_install.`
          );
        }
        return ok(
          `${file.path} is a binary file (${formatSize(file.size)}). Its bytes follow as base64: decode them before writing the file.\n\n${file.bytes.toString("base64")}`
        );
      }

      return ok(file.text);
    }
  );

  server.registerTool(
    "skills_install",
    {
      title: "Install a skill",
      description: [
        "Install a skill so it works in every conversation. Pick the client the person uses:",
        "- claude-app: Claude in the browser, the Claude desktop app or Cowork. Returns a download link and the steps to upload it under Customize > Skills (Claude cannot do that step for them).",
        "- claude-code, codex: returns every file with the folder to write it to (~/.claude/skills or ~/.codex/skills). Write the files exactly as given, then tell the person to restart the agent.",
        "- project: the same, into .agents/skills in the current project.",
        "If unsure which they use, ask.",
      ].join("\n"),
      inputSchema: {
        skill: skillArg,
        client: z.enum(INSTALL_CLIENTS),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ skill, client }) => {
      const found = await resolve(ctx, skill);
      if ("error" in found) return found.error;
      const { entry, version } = found;
      const download = claudeAppDownloadUrl(ctx, entry, version);

      if (client === "claude-app") {
        return ok(
          [
            `To add ${entry.package.name} to Claude, give the person these steps:`,
            `1. Download the skill: ${download}`,
            `   (Opens in the browser. The file lands in Downloads; no need to open it. If the browser asks them to sign in instead, they open ${skillPageUrl(ctx, entry)} and click Download for Claude.)`,
            "2. In Claude, open Customize, then Skills.",
            "3. Click +, then Create skill, then Upload a skill, and pick the downloaded file.",
            "4. Turn the skill on with the switch next to it. Claude then uses it whenever it fits.",
            "",
            "Until then, it can be used in this conversation: read it with skills_get and follow its SKILL.md.",
          ].join("\n")
        );
      }

      const { folder, files } = await readSkillFiles(ctx, entry, version);
      const dir = `${SKILLS_DIR[client]}/${folder}`;
      const total = files.reduce((sum, file) => sum + file.size, 0);

      if (total > INLINE_INSTALL_LIMIT) {
        return ok(
          [
            `${entry.package.name} is ${formatSize(total)}, too large to send file by file.`,
            `Ask the person to download ${download} in their browser, then unzip it into ${SKILLS_DIR[client]}/ so that ${dir}/SKILL.md exists.`,
          ].join("\n")
        );
      }

      await ctx.api.recordArtifactDownload(
        entry.package.id,
        version.id,
        ctx.user.id
      );
      return ok(
        [
          `Install ${entry.package.name} ${version.version}: write each file below to ${dir}/<path>, creating folders as needed and replacing an older copy of the folder. Files marked base64 are binary: decode them before writing.`,
          `Then tell the person it is installed in ${dir} and to restart ${client === "codex" ? "Codex" : client === "claude-code" ? "Claude Code" : "their agent"} so it loads.`,
          "",
          ...files.map(fileBlock),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "skills_vote",
    {
      title: "Upvote a skill",
      description:
        "Mark a skill as useful (useful=true) or take the upvote back (useful=false). One upvote per person; nobody can upvote their own skill. Upvotes push a skill up the Popular list.",
      inputSchema: { skill: skillArg, useful: z.boolean().default(true) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ skill, useful }) => {
      const { entries } = await loadCatalog(ctx);
      const match = findSkill(entries, skill);
      if (!("entry" in match)) return notFound(skill, match.suggestions);
      const result = await castSkillVote(
        ctx.api,
        ctx.user,
        match.entry.package,
        useful
      );
      if ("error" in result) return fail(result.error);
      return ok(
        `${useful ? "Upvoted" : "Removed your upvote from"} ${match.entry.package.name}. It now has ${result.skill.upvotes} upvote(s) and ${result.skill.colleagues} colleague(s) using it.`
      );
    }
  );

  server.registerTool(
    "skills_leaderboard",
    {
      title: "Top skills",
      description:
        "The most popular approved skills: ranked by how many colleagues installed them (recent installs count most) and how many upvotes they got. Each entry names who made it.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { entries } = await loadCatalog(ctx);
      const top = topSkills(entries).slice(0, limit);
      if (top.length === 0)
        return ok("No skill has been installed or upvoted yet.");
      const skills = top.map((entry) => summary(ctx, entry));
      return ok(
        skills
          .map(
            (skill, index) =>
              `${index + 1}. **${skill.name}** (\`${skill.slug}\`)${skill.author ? ` by ${skill.author}` : ""}: used by ${skill.colleagues} colleague(s), ${skill.upvotes} upvote(s)`
          )
          .join("\n")
      );
    }
  );

  registerPublishTools(server, ctx);
}

async function resolve(
  ctx: McpToolContext,
  reference: string,
  requested?: string
): Promise<
  | { error: CallToolResult }
  | { entry: WorkspaceCatalogEntry; version: SkillVersion }
> {
  const { entries } = await loadCatalog(ctx);
  const match = findSkill(entries, reference);

  if (!("entry" in match)) {
    return { error: notFound(reference, match.suggestions) };
  }

  if (requested) {
    return resolveRequestedVersion(ctx, match.entry, requested);
  }

  const version = versionFor(match.entry, ctx.user);

  if (!version) {
    return {
      error: fail(`${match.entry.package.name} has no approved version yet.`),
    };
  }

  return { entry: match.entry, version };
}

/**
 * A specific version, e.g. a draft a maintainer is reviewing. Anyone may read
 * approved versions; drafts and hidden ones only maintainers and their author.
 */
async function resolveRequestedVersion(
  ctx: McpToolContext,
  entry: WorkspaceCatalogEntry,
  requested: string
): Promise<
  | { error: CallToolResult }
  | { entry: WorkspaceCatalogEntry; version: SkillVersion }
> {
  const versions = await ctx.api.packageVersions(entry.package.id);
  const version = versions.find(
    (item) =>
      item.version === requested && mayReadVersion(ctx.user, item, versions)
  );

  if (!version) {
    return {
      error: fail(
        `${entry.package.slug} has no version ${requested} you can read.`
      ),
    };
  }

  return { entry, version };
}

function notFound(reference: string, suggestions: string[]) {
  return fail(
    `No skill called "${reference}".${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""} Use skills_search to find the slug.`
  );
}

/** Approved skills someone installed or upvoted, best first. */
function topSkills(entries: WorkspaceCatalogEntry[]) {
  return entries
    .filter(
      (entry) =>
        entry.latestApproved &&
        ((entry.ranking?.colleagues ?? 0) > 0 ||
          (entry.ranking?.upvotes ?? 0) > 0)
    )
    .sort(
      (left, right) =>
        (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0) ||
        (right.ranking?.colleagues ?? 0) - (left.ranking?.colleagues ?? 0) ||
        left.package.name.localeCompare(right.package.name)
    );
}

function summary(ctx: McpToolContext, entry: WorkspaceCatalogEntry) {
  const version = versionFor(entry, ctx.user);
  return {
    slug: entry.package.slug,
    name: entry.package.name,
    description: entry.package.description,
    categories: entry.package.categories,
    version: version?.version,
    status: version?.lifecycleState,
    author: version?.provenance.actorName,
    colleagues: entry.ranking?.colleagues ?? 0,
    upvotes: entry.ranking?.upvotes ?? 0,
    upvotedByMe: entry.ranking?.votedByMe ?? false,
    url: skillPageUrl(ctx, entry),
  };
}

function fileBlock(file: SkillFile): string {
  if (file.text !== undefined) {
    const fence = file.text.includes("```") ? "~~~~" : "```";
    return [`=== ${file.path} ===`, fence, file.text, fence, ""].join("\n");
  }

  return [
    `=== ${file.path} (base64) ===`,
    file.bytes.toString("base64"),
    "",
  ].join("\n");
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}
