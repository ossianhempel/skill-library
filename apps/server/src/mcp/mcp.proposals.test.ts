import { afterEach, describe, expect, it } from "vitest";
import {
  addUser,
  cleanup,
  connect,
  setup,
  signIn,
  text,
  tokenFor,
} from "./mcp-test-helpers.js";

afterEach(cleanup);

const change = {
  files: [
    {
      path: "SKILL.md",
      content:
        "---\nname: cv-tailor\ndescription: Tailor a CV to an assignment.\n---\n\nAlso keep it to two pages.\n",
    },
  ],
};

describe("proposed changes over MCP", () => {
  it("sends a colleague's change to the owner, who approves it", async () => {
    const { app, store } = await setup();
    const ada = await connect(app, await signIn(app, store, "ada", "user"));

    const sent = await ada.callTool({
      name: "skills_publish",
      arguments: change,
    });
    expect(sent.isError).toBeFalsy();
    expect(text(sent)).toContain(
      "Sent cv-tailor 1.0.1 to Author as a proposed change"
    );

    // Until the owner decides, colleagues keep getting 1.0.0.
    const current = await ada.callTool({
      name: "skills_get",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(current)).toContain("**CV Tailor**");
    expect(text(current)).not.toContain("Also keep it");

    const mine = await ada.callTool({
      name: "skills_proposals",
      arguments: {},
    });
    expect(text(mine)).toContain(
      "You proposed:\n- CV Tailor (`cv-tailor`) 1.0.1 by Ada"
    );

    // A colleague cannot approve their own proposal.
    const selfApprove = await ada.callTool({
      name: "skills_review_proposal",
      arguments: { skill: "cv-tailor", version: "1.0.1", decision: "approve" },
    });
    expect(selfApprove.isError).toBe(true);

    const owner = await connect(app, await tokenFor(app, store, "author"));
    const waiting = await owner.callTool({
      name: "skills_proposals",
      arguments: {},
    });
    expect(text(waiting)).toContain(
      "Waiting for your decision:\n- CV Tailor (`cv-tailor`) 1.0.1 by Ada"
    );

    // The owner can read the proposal before deciding.
    const read = await owner.callTool({
      name: "skills_get",
      arguments: { skill: "cv-tailor", version: "1.0.1" },
    });
    expect(text(read)).toContain("Also keep it to two pages.");

    const approve = await owner.callTool({
      name: "skills_review_proposal",
      arguments: { skill: "cv-tailor", version: "1.0.1", decision: "approve" },
    });
    expect(text(approve)).toContain("Approved: cv-tailor 1.0.1 by Ada");

    const latest = await ada.callTool({
      name: "skills_get",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(latest)).toContain("Also keep it to two pages.");

    await ada.close();
    await owner.close();
  });

  it("lets the owner reject a proposal and keeps the current version", async () => {
    const { app, store } = await setup();
    const ada = await connect(app, await signIn(app, store, "ada", "user"));
    await ada.callTool({ name: "skills_publish", arguments: change });

    const owner = await connect(app, await tokenFor(app, store, "author"));
    const reject = await owner.callTool({
      name: "skills_review_proposal",
      arguments: { skill: "cv-tailor", version: "1.0.1", decision: "reject" },
    });
    expect(text(reject)).toContain("Rejected cv-tailor 1.0.1");

    const none = await owner.callTool({
      name: "skills_proposals",
      arguments: {},
    });
    expect(text(none)).toBe("No proposed changes are waiting.");

    const current = await ada.callTool({
      name: "skills_get",
      arguments: { skill: "cv-tailor" },
    });
    expect(text(current)).not.toContain("Also keep it");

    await ada.close();
    await owner.close();
  });

  it("does not show a proposal to a colleague who is not involved", async () => {
    const { app, store } = await setup();
    const ada = await connect(app, await signIn(app, store, "ada", "user"));
    await ada.callTool({ name: "skills_publish", arguments: change });

    await addUser(store, "bob", "user");
    const bob = await connect(app, await tokenFor(app, store, "bob"));
    const list = await bob.callTool({
      name: "skills_proposals",
      arguments: {},
    });
    expect(text(list)).toBe("No proposed changes are waiting.");
    const read = await bob.callTool({
      name: "skills_get",
      arguments: { skill: "cv-tailor", version: "1.0.1" },
    });
    expect(read.isError).toBe(true);

    await ada.close();
    await bob.close();
  });
});
