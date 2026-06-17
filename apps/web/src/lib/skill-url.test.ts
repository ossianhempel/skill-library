import { describe, expect, it } from "vitest";
import { buildSkillPath, buildSkillUrl, parseSkillPath } from "./skill-url.js";

describe("skill-url", () => {
  it("round-trips a workspace and slug through path build/parse", () => {
    const path = buildSkillPath("main", "cool-skill");
    expect(path).toBe("/s/main/cool-skill");
    expect(parseSkillPath(path)).toEqual({
      workspaceId: "main",
      slug: "cool-skill",
    });
  });

  it("encodes and decodes segments with spaces and special characters", () => {
    const path = buildSkillPath("acme corp", "Cool Skill");
    expect(path).toBe("/s/acme%20corp/Cool%20Skill");
    expect(parseSkillPath(path)).toEqual({
      workspaceId: "acme corp",
      slug: "Cool Skill",
    });
  });

  it("builds an absolute URL and trims a trailing slash from the origin", () => {
    expect(
      buildSkillUrl("https://skills.example.com/", "main", "cool-skill")
    ).toBe("https://skills.example.com/s/main/cool-skill");
  });

  it("returns null for non-skill paths", () => {
    expect(parseSkillPath("/")).toBeNull();
    expect(parseSkillPath("/catalog")).toBeNull();
    expect(parseSkillPath("/s/main")).toBeNull();
    expect(parseSkillPath("/x/main/cool-skill")).toBeNull();
  });

  it("ignores trailing segments beyond workspace and slug", () => {
    expect(parseSkillPath("/s/main/cool-skill/extra")).toEqual({
      workspaceId: "main",
      slug: "cool-skill",
    });
  });
});
