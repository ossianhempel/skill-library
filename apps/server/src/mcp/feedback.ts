import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpToolContext } from "./skills.js";
import { fail, ok } from "./format.js";

/**
 * skills_report_feedback: the agent using this server reports what got in
 * its way (a tool that failed, was missing, confusing or gave a wrong
 * result) with a proposed fix. The agent knows what it was trying to do and
 * where the tools fell short, so it is the best placed to write the issue.
 * Each report becomes an Azure Boards work item, tagged `mcp-feedback` and
 * `mcp:<server id>`, where a person decides what to change.
 *
 * Registered only when FEEDBACK_ADO_ORG (e.g. https://dev.azure.com/acme),
 * FEEDBACK_ADO_PROJECT and FEEDBACK_ADO_PAT (Work Items read & write) are
 * set. FEEDBACK_ADO_AREA and FEEDBACK_ADO_TYPE (default Issue) are optional.
 */

export const FEEDBACK_KINDS = [
  "bug",
  "missing_tool",
  "confusing_tool",
  "wrong_result",
  "idea",
] as const;
type Kind = (typeof FEEDBACK_KINDS)[number];

/** How badly the gap hurt; the best field to sort the board by. */
export const FEEDBACK_IMPACTS = [
  "blocked",
  "worked_around",
  "friction",
] as const;
type Impact = (typeof FEEDBACK_IMPACTS)[number];

// Filler agents send instead of a report, compared after lowercasing and
// dropping all but letters and digits.
const PLACEHOLDERS = new Set([
  "",
  "na",
  "none",
  "noop",
  "null",
  "placeholder",
  "tbd",
  "test",
  "todo",
  "undefined",
  "xxx",
]);

export function isPlaceholder(text: string): boolean {
  return PLACEHOLDERS.has(text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
}

const SECRETS: [RegExp, string][] = [
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[token]"], // JWT
  [/\b(bearer|basic)\s+[\w\-.~+/=]{12,}/gi, "$1 [token]"],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|pat)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi,
    "$1$2[redacted]",
  ],
  // Long runs of letters and digits, like an access token; not paths (no / or -).
  [/\b(?=\w*\d)(?=\w*[A-Za-z])\w{32,}/g, "[secret]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
];

/** Remove what looks like a secret or an email address before the report leaves the server. */
export function scrub(text: string): string {
  return SECRETS.reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

export const FEEDBACK_TAG = "mcp-feedback";
/** Reports per person per hour: a loop filing the same thing stops here. */
export const FEEDBACK_PER_HOUR = 10;

export interface FeedbackReport {
  server: string;
  kind: Kind;
  impact?: Impact;
  title: string;
  goal: string;
  whatHappened: string;
  proposedFix: string;
  tool?: string;
  reporter: string;
  client?: string;
}

export interface FeedbackSink {
  file(report: FeedbackReport): Promise<{ id: number; url: string }>;
}

export function feedbackSinkFromEnv(
  env: NodeJS.ProcessEnv = process.env
): FeedbackSink | undefined {
  const org = env.FEEDBACK_ADO_ORG?.trim().replace(/\/$/, "");
  const project = env.FEEDBACK_ADO_PROJECT?.trim();
  const pat = env.FEEDBACK_ADO_PAT?.trim();
  if (!org || !project || !pat) return undefined;
  return azureBoards({
    org,
    project,
    pat,
    area: env.FEEDBACK_ADO_AREA?.trim() || undefined,
    type: env.FEEDBACK_ADO_TYPE?.trim() || "Issue",
  });
}

export function azureBoards(config: {
  org: string;
  project: string;
  pat: string;
  area?: string;
  type: string;
}): FeedbackSink {
  return {
    async file(report) {
      const fields: Record<string, string> = {
        "System.Title": `[${report.server}] ${report.title}`.slice(0, 255),
        "System.Description": describe(report),
        "System.Tags": [
          FEEDBACK_TAG,
          `mcp:${report.server}`,
          `kind:${report.kind}`,
          ...(report.impact ? [`impact:${report.impact}`] : []),
        ].join("; "),
        ...(config.area ? { "System.AreaPath": config.area } : {}),
      };
      const response = await fetch(
        `${config.org}/${encodeURIComponent(config.project)}/_apis/wit/workitems/$${encodeURIComponent(config.type)}?api-version=7.1`,
        {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`,
            "content-type": "application/json-patch+json",
          },
          body: JSON.stringify(
            Object.entries(fields).map(([field, value]) => ({
              op: "add",
              path: `/fields/${field}`,
              value,
            }))
          ),
          signal: AbortSignal.timeout(20_000),
        }
      );
      const item = (await response.json().catch(() => ({}))) as { id?: number };
      if (!response.ok || typeof item.id !== "number") {
        throw new Error(
          `Azure Boards refused the report (HTTP ${response.status}). Tell the person; the feedback was not saved.`
        );
      }
      return {
        id: item.id,
        url: `${config.org}/${encodeURIComponent(config.project)}/_workitems/edit/${item.id}`,
      };
    },
  };
}

function describe(report: FeedbackReport): string {
  const para = (text: string) => escape(text.trim()).split("\n").join("<br>");
  const rows: [string, string][] = [
    ["Server", report.server],
    ["Tool", report.tool ?? "-"],
    ["Kind", report.kind],
    ["Impact", report.impact ?? "-"],
    ["Reported by", report.reporter],
    ["AI client", report.client ?? "unknown"],
  ];
  return [
    "<p><i>Filed by an AI agent through the MCP tool. A person decides whether to act on it.</i></p>",
    `<table>${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${escape(v)}</td></tr>`).join("")}</table>`,
    `<h3>What the agent was trying to do</h3><p>${para(report.goal)}</p>`,
    `<h3>What happened</h3><p>${para(report.whatHappened)}</p>`,
    `<h3>Proposed fix</h3><p>${para(report.proposedFix)}</p>`,
  ].join("");
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const recent = new Map<string, number[]>();

/** For tests: forget who filed what. */
export function resetFeedbackLimits() {
  recent.clear();
}

export function registerFeedbackTool(
  server: McpServer,
  ctx: McpToolContext,
  sink: FeedbackSink,
  serverId: string
) {
  const prose = (what: string) =>
    z
      .string()
      .min(10)
      .refine((text) => !isPlaceholder(text), {
        message:
          "This is a placeholder. Describe what you tried and what went wrong, or skip this tool if there is nothing to report.",
      })
      .describe(what);
  server.registerTool(
    "skills_report_feedback",
    {
      title: "Report a problem or idea about these tools",
      description: `Tell the people who build ${ctx.appName}'s MCP server about a problem, so it gets fixed: a tool that failed, was missing, confusing or slow, gave a wrong or useless result, or an idea that would have made your task easier. Use it on your own, without asking, whenever a tool got in your way; then tell the person in one line what you reported. At most once per task; skip it when the task went fine, and never use it to log progress or to test it. It files an issue that a person reviews. Leave out personal data and anything confidential: describe the problem.`,
      inputSchema: {
        kind: z
          .enum(FEEDBACK_KINDS)
          .describe(
            '"bug" (a tool failed), "missing_tool" (no tool does what you needed), "confusing_tool" (unclear name, description or parameters), "wrong_result" (a result was wrong, stale or useless), "idea".'
          ),
        title: z
          .string()
          .min(5)
          .refine((text) => !isPlaceholder(text), {
            message: "This is a placeholder. Name the problem in one line.",
          })
          .describe(
            "One line naming the problem, e.g. 'skills_search can't filter by author'."
          ),
        goal: prose("What you were trying to do for the person, and why."),
        what_happened: prose(
          "The calls you made (tool and arguments), what came back, and how you worked around it, if you did."
        ),
        proposed_fix: prose(
          "The concrete change you propose to a tool, its description, parameters or results. Specific enough that a developer can act on it without asking you."
        ),
        tool: z
          .string()
          .optional()
          .describe('The tool it is about, e.g. "skills_search".'),
        impact: z
          .enum(FEEDBACK_IMPACTS)
          .optional()
          .describe(
            'Optional, but please fill it: "blocked" (you could not finish), "worked_around" (you finished another way), "friction" (you finished, but it was harder than it should be).'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const reporter = ctx.user.email || ctx.user.id;
      const now = Date.now();
      const mine = (recent.get(reporter) ?? []).filter(
        (at) => now - at < 3_600_000
      );
      if (mine.length >= FEEDBACK_PER_HOUR) {
        return fail(
          `You have filed ${FEEDBACK_PER_HOUR} reports in the last hour; add to one of those instead of filing more.`
        );
      }
      // Reserve the slot before awaiting the sink, so parallel calls can't all pass the check.
      mine.push(now);
      recent.set(reporter, mine);
      const info = server.server.getClientVersion();
      try {
        const item = await sink.file({
          server: serverId,
          kind: args.kind,
          impact: args.impact,
          title: scrub(args.title.split(/\s+/).join(" ")),
          goal: scrub(args.goal),
          whatHappened: scrub(args.what_happened),
          proposedFix: scrub(args.proposed_fix),
          tool: args.tool,
          reporter,
          client: info
            ? `${info.name} ${info.version ?? ""}`.trim()
            : ctx.user.clientName,
        });
        return ok(
          `Filed as work item ${item.id} (${item.url}), tagged ${FEEDBACK_TAG}. A person reviews it; tell the person in one line what you reported.`
        );
      } catch (error) {
        mine.splice(mine.indexOf(now), 1); // a report that wasn't saved doesn't count
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );
}

/** The `intent` argument; telemetry.ts records it on the call's span. */
export const intentArg = z
  .string()
  .optional()
  .describe(
    "Optional, but please fill it: one sentence on why you are calling: the question or task itself, e.g. 'A skill that reviews SQL before a release'. Leave out who asked: no names, no 'the user wants'. Used to check that search finds what people need."
  );
