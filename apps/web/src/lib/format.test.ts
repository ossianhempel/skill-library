import { describe, expect, it } from "vitest";
import { parseSimpleFrontmatter } from "./format.js";

describe("parseSimpleFrontmatter", () => {
  it("reads a folded block description as its text", () => {
    const md = [
      "---",
      "name: install-raid",
      "description: >-",
      "  Install Rebtech's RAID plugin",
      "  in the current agent environment.",
      "categories: [delivery, raid]",
      "---",
      "",
      "# Install RAID",
    ].join("\n");

    expect(parseSimpleFrontmatter(md)).toEqual({
      name: "install-raid",
      description:
        "Install Rebtech's RAID plugin in the current agent environment.",
      categories: ["delivery", "raid"],
    });
  });

  it("reads plain values and dash lists", () => {
    const md =
      '---\nname: "pdf"\ndescription: "Work with PDFs: merge, split"\ncategories:\n  - office\n  - docs\n---\n';
    expect(parseSimpleFrontmatter(md)).toEqual({
      name: "pdf",
      description: "Work with PDFs: merge, split",
      categories: ["office", "docs"],
    });
  });

  it("returns an empty object without frontmatter or with broken YAML", () => {
    expect(parseSimpleFrontmatter("# Just a heading")).toEqual({});
    expect(parseSimpleFrontmatter("---\nname: [unclosed\n---\n")).toEqual({});
  });
});
