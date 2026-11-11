import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
  tokenFor,
} from "./mcp-test-helpers.js";
import { claudeViewDomain, VIEW_URI } from "./views.js";

const spans = new InMemorySpanExporter();

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
  await cleanup();
});

type Result = Awaited<
  ReturnType<Awaited<ReturnType<typeof connect>>["callTool"]>
>;
const view = (result: Result) =>
  (result._meta as Record<string, unknown> | undefined)?.["skill-library/view"];

describe("MCP Apps view", () => {
  it("attaches the view to the catalog tools and serves it as a ui:// page", async () => {
    const { app, store } = await setup();
    const client = await connect(app, await signIn(app, store, "ada", "user"));

    const { tools } = await client.listTools();
    const withView = tools
      .filter(
        (tool) =>
          (tool._meta?.ui as { resourceUri?: string } | undefined)
            ?.resourceUri === VIEW_URI
      )
      .map((tool) => tool.name);
    expect(withView).toEqual([
      "skills_search",
      "skills_leaderboard",
      "skills_proposals",
    ]);

    const { resources } = await client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({
        uri: VIEW_URI,
        mimeType: "text/html;profile=mcp-app",
      })
    );

    const page = (await client.readResource({ uri: VIEW_URI })).contents[0]!;
    expect(page.mimeType).toBe("text/html;profile=mcp-app");
    const html = "text" in page ? page.text : "";
    expect(html).toContain('"ui/initialize"');
    expect(html).toContain(".card {");
    expect(html).not.toContain("VIEW_JS");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(page._meta).toEqual({
      ui: {
        csp: {},
        domain: claudeViewDomain(`${BASE}/mcp`),
        prefersBorder: false,
      },
    });
    expect(claudeViewDomain("https://example.com/mcp")).toMatch(
      /^[0-9a-f]{32}\.claudemcpcontent\.com$/
    );
  });

  it("sends skill cards to the view without changing what the model reads", async () => {
    const { app, store } = await setup();
    const client = await connect(app, await signIn(app, store, "ada", "user"));

    const search = await client.callTool({
      name: "skills_search",
      arguments: { query: "cv" },
    });
    expect(text(search)).toContain("**CV Tailor** (`cv-tailor`)");
    // Claude Code would show the model structuredContent instead of the text.
    expect(search.structuredContent).toBeUndefined();
    expect(view(search)).toEqual({
      kind: "catalog",
      title: 'Skills matching "cv"',
      query: "cv",
      total: 1,
      skills: [
        expect.objectContaining({
          slug: "cv-tailor",
          name: "CV Tailor",
          version: "1.0.0",
          author: "Author",
          upvotes: 0,
          upvotedByMe: false,
          mine: false,
          url: `${BASE}/s/main/cv-tailor`,
        }),
      ],
    });

    // The view's buttons call the same tools, marked as view calls.
    const vote = await client.callTool({
      name: "skills_vote",
      arguments: { skill: "cv-tailor", useful: true },
      _meta: { "skill-library/caller": "view" },
    });
    expect(view(vote)).toEqual({
      kind: "vote",
      slug: "cv-tailor",
      upvotes: 1,
      colleagues: 0,
      upvotedByMe: true,
    });
    const [voteSpan] = spans
      .getFinishedSpans()
      .filter((span) => span.name === "tools/call skills_vote");
    expect(voteSpan?.attributes["mcp.tool.caller"]).toBe("view");
    const [searchSpan] = spans
      .getFinishedSpans()
      .filter((span) => span.name === "tools/call skills_search");
    expect(searchSpan?.attributes["mcp.tool.caller"]).toBeUndefined();

    const install = await client.callTool({
      name: "skills_install",
      arguments: { skill: "cv-tailor", client: "claude-app" },
    });
    expect(text(install)).toContain("Customize, then Skills");
    expect(view(install)).toMatchObject({
      kind: "install",
      slug: "cv-tailor",
      downloadUrl: expect.stringContaining("layout=claude-app"),
    });

    await client.close();
  });

  it("shows the owner a proposed change as a diff they can approve", async () => {
    const { app, store } = await setup();
    const ada = await connect(app, await signIn(app, store, "ada", "user"));
    await ada.callTool({
      name: "skills_publish",
      arguments: {
        files: [
          {
            path: "SKILL.md",
            content:
              "---\nname: cv-tailor\ndescription: Tailor a CV to an assignment.\n---\n\nTailor a CV to an assignment.\nAlso keep it to two pages.\n",
          },
          { path: "references/rules.md", content: "Keep it to two pages." },
        ],
      },
    });

    const owner = await connect(app, await tokenFor(app, store, "author"));
    const proposals = await owner.callTool({
      name: "skills_proposals",
      arguments: {},
    });
    expect(text(proposals)).toContain("Waiting for your decision:");
    const data = view(proposals) as {
      forMe: Array<{ files: Array<{ path: string }> }>;
    };
    expect(data).toMatchObject({
      kind: "proposals",
      fromMe: [],
      forMe: [
        {
          slug: "cv-tailor",
          version: "1.0.1",
          author: "Ada",
          currentVersion: "1.0.0",
          valid: true,
          files: [
            {
              path: "SKILL.md",
              status: "changed",
              hunks: [
                [
                  { op: " ", text: "---" },
                  { op: " ", text: "" },
                  { op: " ", text: "Tailor a CV to an assignment." },
                  { op: "+", text: "Also keep it to two pages." },
                ],
              ],
            },
            { path: "logo.png", status: "removed", binary: true },
          ],
        },
      ],
    });

    const approve = await owner.callTool({
      name: "skills_review_proposal",
      arguments: { skill: "cv-tailor", version: "1.0.1", decision: "approve" },
      _meta: { "skill-library/caller": "view" },
    });
    expect(text(approve)).toContain("Approved: cv-tailor 1.0.1 by Ada");
    expect(view(approve)).toEqual({
      kind: "review",
      slug: "cv-tailor",
      version: "1.0.1",
      decision: "approve",
    });

    await ada.close();
    await owner.close();
  });
});
