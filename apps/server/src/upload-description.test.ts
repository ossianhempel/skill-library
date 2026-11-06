import { describe, expect, it } from "vitest";
import { uploadDescription } from "./publishing-author.js";

const skillMd = [
  "---",
  "name: install-raid",
  "description: >-",
  "  Installs Rebtech's RAID plugin",
  "  into your agent.",
  "---",
  "",
  "# Install RAID",
].join("\n");

describe("uploadDescription", () => {
  it("takes the SKILL.md text when the client sent a YAML block header", () => {
    expect(
      uploadDescription(">-", [{ path: "SKILL.md", content: skillMd }])
    ).toBe("Installs Rebtech's RAID plugin into your agent.");
    expect(
      uploadDescription("|", [
        {
          path: "SKILL.md",
          content: Buffer.from(skillMd).toString("base64"),
          encoding: "base64",
        },
      ])
    ).toBe("Installs Rebtech's RAID plugin into your agent.");
  });

  it("keeps a real description as given", () => {
    expect(
      uploadDescription("Short summary from the form", [
        { path: "SKILL.md", content: skillMd },
      ])
    ).toBe("Short summary from the form");
  });
});
