import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  BASE,
  cleanup,
  connect,
  setup,
  signIn,
  text,
} from "./mcp-test-helpers.js";
import { FEEDBACK_PER_HOUR, resetFeedbackLimits } from "./feedback.js";

const spans = new InMemorySpanExporter();
const REPORT = {
  kind: "missing_tool",
  title: "skills_search can't filter by author",
  goal: "The person wanted every skill a colleague published.",
  what_happened:
    "skills_search has no author parameter, so I listed all skills and filtered by hand.",
  proposed_fix:
    "Add an optional author parameter to skills_search that matches the author's name or email.",
  tool: "skills_search",
};

beforeAll(() => {
  process.env.BETTER_AUTH_URL = BASE;
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spans)],
    })
  );
});

afterEach(async () => {
  spans.reset();
  resetFeedbackLimits();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await cleanup();
});

/** Azure Boards stand-in: records what was filed and answers with an id. */
function fakeBoards(status = 200, delayMs = 0) {
  const filed: { url: string; patch: { path: string; value: string }[] }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    filed.push({ url, patch: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(status < 300 ? { id: 512 } : {}), {
      status,
    });
  });
  return filed;
}

async function signedIn() {
  const { app, store } = await setup();
  return connect(app, await signIn(app, store, "ada", "user"));
}

function configure() {
  vi.stubEnv("FEEDBACK_ADO_ORG", "https://dev.azure.com/acme");
  vi.stubEnv("FEEDBACK_ADO_PROJECT", "Tools");
  vi.stubEnv("FEEDBACK_ADO_PAT", "pat");
}

describe("skills_report_feedback", () => {
  it("files the agent's report as a tagged work item credited to the person", async () => {
    configure();
    const filed = fakeBoards();
    const client = await signedIn();

    const result = await client.callTool({
      name: "skills_report_feedback",
      arguments: REPORT,
    });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("work item 512");
    expect(text(result)).toContain(
      "https://dev.azure.com/acme/Tools/_workitems/edit/512"
    );
    const { url, patch } = filed[0]!;
    expect(url).toBe(
      "https://dev.azure.com/acme/Tools/_apis/wit/workitems/$Issue?api-version=7.1"
    );
    const fields = Object.fromEntries(
      patch.map((op) => [op.path.replace("/fields/", ""), op.value])
    );
    expect(fields["System.Title"]).toBe(
      "[skill-library] skills_search can't filter by author"
    );
    expect(fields["System.Tags"]).toBe(
      "mcp-feedback; mcp:skill-library; kind:missing_tool"
    );
    expect(fields["System.Description"]).toContain(
      "Add an optional author parameter"
    );
    expect(fields["System.Description"]).toContain("ada");
    const span = spans
      .getFinishedSpans()
      .find((s) => s.name === "tools/call skills_report_feedback");
    expect(JSON.stringify(span?.attributes)).not.toContain("author parameter");
  });

  it("says so when Azure Boards refuses, instead of losing the report quietly", async () => {
    configure();
    fakeBoards(401);
    const client = await signedIn();
    const result = await client.callTool({
      name: "skills_report_feedback",
      arguments: REPORT,
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not saved");
  });

  it("stops one person from flooding the board, even with parallel calls", async () => {
    configure();
    const filed = fakeBoards(200, 50); // slow board: calls overlap
    const client = await signedIn();
    const results = await Promise.all(
      Array.from({ length: FEEDBACK_PER_HOUR + 5 }, () =>
        client.callTool({ name: "skills_report_feedback", arguments: REPORT })
      )
    );
    const refused = results.filter((r) => r.isError);
    expect(refused).toHaveLength(5);
    expect(text(refused[0]!)).toContain("last hour");
    expect(filed).toHaveLength(FEEDBACK_PER_HOUR);
  });

  it("tags the impact, refuses placeholders and scrubs secrets before filing", async () => {
    configure();
    const filed = fakeBoards();
    const client = await signedIn();
    const placeholder = await client.callTool({
      name: "skills_report_feedback",
      arguments: { ...REPORT, proposed_fix: "TODO........" },
    });
    expect(placeholder.isError).toBe(true);
    expect(text(placeholder)).toContain("placeholder");
    expect(filed).toHaveLength(0);

    const pat = "1234567890abcdefghij1234567890abcdefghij1234567890ab";
    const result = await client.callTool({
      name: "skills_report_feedback",
      arguments: {
        ...REPORT,
        impact: "blocked",
        what_happened: `skills_search failed with token ${pat}; asked by kim@example.com, password=hunter22x; called skills_install({"api_key":"abcdefghijk"})`,
      },
    });
    expect(result.isError).toBeFalsy();
    const fields = Object.fromEntries(
      filed[0]!.patch.map((op) => [op.path, op.value])
    );
    expect(fields["/fields/System.Tags"]).toContain("impact:blocked");
    const description = fields["/fields/System.Description"]!;
    expect(description).not.toContain(pat);
    expect(description).not.toContain("kim@example.com");
    expect(description).not.toContain("hunter22x");
    expect(description).not.toContain("abcdefghijk");
    expect(description).toContain("skills_search failed");
  });

  it("is not offered when feedback is not configured", async () => {
    const client = await signedIn();
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).not.toContain("skills_report_feedback");
  });
});

describe("intent", () => {
  it("records why the agent searched next to the search", async () => {
    const client = await signedIn();
    await client.callTool({
      name: "skills_search",
      arguments: { query: "cv", intent: "Help  tailoring a CV\n" },
    });
    const span = spans
      .getFinishedSpans()
      .find((s) => s.name === "tools/call skills_search");
    expect(span?.attributes["mcp.tool.intent"]).toBe("Help tailoring a CV");
  });
});
