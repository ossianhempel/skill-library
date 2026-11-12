import { afterEach, describe, expect, it } from "vitest";
import {
  addUser,
  cleanup,
  connect,
  setup,
  signIn,
  text,
  type App,
} from "./mcp/mcp-test-helpers.js";

afterEach(cleanup);

// Dev header auth (non-production) stands in for signed-in users.
const as = (id: string, role = "user") => ({
  "content-type": "application/json",
  "x-skill-library-actor": id,
  "x-skill-library-role": role,
});

const brain = {
  name: "Company brain",
  description: "Search and add to the company wiki.",
  url: "https://brain.example.com/mcp",
  access: "Everyone at the company",
  notes: "Sign in with your work account.",
};

const LIST = "/api/workspaces/main/mcp-servers";

async function add(app: App, actor: string, body: object, role = "user") {
  return app.request(LIST, {
    method: "POST",
    headers: as(actor, role),
    body: JSON.stringify(body),
  });
}

describe("MCP servers tab API", () => {
  it("lets a colleague add a server that everyone then sees with connect commands", async () => {
    const { app, store } = await setup();
    await addUser(store, "ada", "user");

    const created = await add(app, "ada", brain);
    expect(created.status).toBe(201);

    const response = await app.request(LIST, { headers: as("bo") });
    const { servers } = await response.json();
    expect(servers).toEqual([
      expect.objectContaining({
        slug: "company-brain",
        name: "Company brain",
        url: "https://brain.example.com/mcp",
        access: "Everyone at the company",
        createdByName: "Ada",
        canEdit: false,
        claudeCodeCommand:
          "claude mcp add --transport http --scope user company-brain https://brain.example.com/mcp",
        codexCommand:
          "codex mcp add company-brain --url https://brain.example.com/mcp",
      }),
    ]);
  });

  it("refuses visitors who are not signed in, and URLs that are not https", async () => {
    const { app } = await setup();

    expect((await app.request(LIST)).status).toBe(403);
    const insecure = await add(app, "ada", {
      ...brain,
      url: "http://brain.example.com/mcp",
    });
    expect(insecure.status).toBe(400);
    expect((await insecure.json()).error).toContain("not an https URL");
  });

  it("lets only whoever added a server, or a maintainer, change or remove it", async () => {
    const { app, store } = await setup();
    await addUser(store, "ada", "user");
    await add(app, "ada", brain);
    const change = (actor: string, role = "user") =>
      app.request(`${LIST}/company-brain`, {
        method: "PUT",
        headers: as(actor, role),
        body: JSON.stringify({
          ...brain,
          url: "https://brain2.example.com/mcp",
        }),
      });

    expect((await change("bo")).status).toBe(403);
    expect((await add(app, "bo", brain)).status).toBe(409);
    expect((await change("ada")).status).toBe(200);

    const removedByOther = await app.request(`${LIST}/company-brain`, {
      method: "DELETE",
      headers: as("bo"),
    });
    expect(removedByOther.status).toBe(403);
    const removed = await app.request(`${LIST}/company-brain`, {
      method: "DELETE",
      headers: as("max", "maintainer"),
    });
    expect(removed.status).toBe(200);
    const { servers } = await (
      await app.request(LIST, { headers: as("bo") })
    ).json();
    expect(servers).toEqual([]);
  });
});

describe("MCP server tools", () => {
  it("lets an agent add a server, find it and get the connect steps", async () => {
    const { app, store } = await setup();
    const ada = await connect(app, await signIn(app, store, "ada", "user"));

    const saved = await ada.callTool({
      name: "mcp_servers_save",
      arguments: { ...brain, slug: "brain" },
    });
    expect(saved.isError).toBeFalsy();
    expect(text(saved)).toContain("Added Company brain.");

    const listed = await ada.callTool({
      name: "mcp_servers_list",
      arguments: { query: "wiki" },
    });
    expect(text(listed)).toContain("## Company brain (`brain`)");
    expect(text(listed)).toContain(
      "`claude mcp add --transport http --scope user brain https://brain.example.com/mcp`"
    );
    expect(text(listed)).toContain("Who can use it: Everyone at the company");

    // What the agent added is what the tab shows.
    const { servers } = await (
      await app.request(LIST, { headers: as("bo") })
    ).json();
    expect(servers.map((server: { slug: string }) => server.slug)).toEqual([
      "brain",
    ]);
  });

  it("keeps a colleague's agent from removing someone else's server", async () => {
    const { app, store } = await setup();
    await addUser(store, "ada", "user");
    await add(app, "ada", brain);
    const bo = await connect(app, await signIn(app, store, "bo", "user"));

    const removed = await bo.callTool({
      name: "mcp_servers_remove",
      arguments: { slug: "company-brain" },
    });
    expect(removed.isError).toBe(true);
    expect(text(removed)).toContain("Only Ada or a maintainer");
  });
});
