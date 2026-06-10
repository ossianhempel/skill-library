import { describe, expect, it } from "vitest";
import { SKILL_MD_BODY_SIZE_WARNING_CHARS, validateSkillMd } from "./skill-md.js";

describe("validateSkillMd", () => {
  it("accepts valid frontmatter with matching directory name", () => {
    const issues = validateSkillMd(
      `---
name: code-review
description: Review code changes for bugs and test gaps.
---

# Code review
`,
      "code-review",
      "code-review/SKILL.md"
    );

    expect(issues).toEqual([]);
  });

  it("reports missing frontmatter", () => {
    const issues = validateSkillMd("# Heading only\n", "demo", "demo/SKILL.md");

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-missing-frontmatter",
        severity: "error"
      })
    );
  });

  it("reports invalid name format", () => {
    const issues = validateSkillMd(
      `---
name: Bad_Name
description: Invalid name format.
---
`,
      "Bad_Name",
      "Bad_Name/SKILL.md"
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-invalid-name-format",
        severity: "error"
      })
    );
  });

  it("reports name directory mismatch", () => {
    const issues = validateSkillMd(
      `---
name: other-name
description: Name does not match folder.
---
`,
      "review-helper",
      "review-helper/SKILL.md"
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-name-directory-mismatch",
        severity: "error"
      })
    );
  });

  it("reports missing description", () => {
    const issues = validateSkillMd(
      `---
name: demo
---
`,
      "demo",
      "demo/SKILL.md"
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-missing-description",
        severity: "error"
      })
    );
  });

  it("warns when the body is empty", () => {
    const issues = validateSkillMd(
      `---
name: demo
description: Valid frontmatter with no body.
---
`,
      "demo",
      "demo/SKILL.md"
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-body-empty",
        severity: "warning"
      })
    );
  });

  it("warns when the body exceeds the recommended size", () => {
    const issues = validateSkillMd(
      `---
name: demo
description: Large body warning.
---

${"x".repeat(SKILL_MD_BODY_SIZE_WARNING_CHARS + 1)}
`,
      "demo",
      "demo/SKILL.md"
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: "skill-md-body-large",
        severity: "warning"
      })
    );
  });

  it("skips directory mismatch when the skill root is the package root", () => {
    const issues = validateSkillMd(
      `---
name: any-valid-name
description: Flat upload layout without a named folder segment.
---

# Body
`,
      ".",
      "SKILL.md"
    );

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
