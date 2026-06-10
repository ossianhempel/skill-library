import { parse as parseYaml } from "yaml";
import type { ValidationIssue } from "@skill-library/domain";

/** Approximates ~5000 tokens; see docs/validation-rules.md */
export const SKILL_MD_BODY_SIZE_WARNING_CHARS = 20_000;

const NAME_PATTERN = /^[a-z0-9-]+$/;
const DESCRIPTION_MAX_LENGTH = 1024;

export function validateSkillMd(content: string, skillRoot: string, skillMdPath: string): ValidationIssue[] {
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    return [
      {
        ruleId: "skill-md-missing-frontmatter",
        severity: "error",
        message: "SKILL.md must begin with YAML frontmatter delimited by --- lines.",
        path: skillMdPath
      }
    ];
  }

  const issues: ValidationIssue[] = [];
  const { frontmatter, body } = parsed;
  const name = readStringField(frontmatter, "name");

  if (!name) {
    issues.push({
      ruleId: "skill-md-missing-name",
      severity: "error",
      message: "SKILL.md frontmatter must include a non-empty name field.",
      path: skillMdPath
    });
  } else {
    if (!isValidNameFormat(name)) {
      issues.push({
        ruleId: "skill-md-invalid-name-format",
        severity: "error",
        message: "name must be 1-64 lowercase letters, numbers, or hyphens without leading, trailing, or consecutive hyphens.",
        path: skillMdPath
      });
    }

    if (skillRoot !== ".") {
      const expectedName = skillRoot.split("/").at(-1) ?? skillRoot;

      if (name !== expectedName) {
        issues.push({
          ruleId: "skill-md-name-directory-mismatch",
          severity: "error",
          message: `name must match the skill directory (${expectedName}).`,
          path: skillMdPath
        });
      }
    }
  }

  const description = readStringField(frontmatter, "description");

  if (!description) {
    issues.push({
      ruleId: "skill-md-missing-description",
      severity: "error",
      message: "SKILL.md frontmatter must include a non-empty description field.",
      path: skillMdPath
    });
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      ruleId: "skill-md-invalid-description-length",
      severity: "error",
      message: `description must be between 1 and ${DESCRIPTION_MAX_LENGTH} characters.`,
      path: skillMdPath
    });
  }

  if (!body.trim()) {
    issues.push({
      ruleId: "skill-md-body-empty",
      severity: "warning",
      message: "SKILL.md body is empty after frontmatter.",
      path: skillMdPath
    });
  } else if (body.length > SKILL_MD_BODY_SIZE_WARNING_CHARS) {
    issues.push({
      ruleId: "skill-md-body-large",
      severity: "warning",
      message: `SKILL.md body exceeds the recommended size (${SKILL_MD_BODY_SIZE_WARNING_CHARS} characters).`,
      path: skillMdPath
    });
  }

  return issues;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | undefined {
  if (!content.startsWith("---")) {
    return undefined;
  }

  const closingMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)([\s\S]*)$/);

  if (!closingMatch) {
    return undefined;
  }

  let frontmatterValue: unknown;

  try {
    frontmatterValue = parseYaml(closingMatch[1] ?? "");
  } catch {
    return undefined;
  }

  if (!frontmatterValue || typeof frontmatterValue !== "object" || Array.isArray(frontmatterValue)) {
    return undefined;
  }

  return {
    frontmatter: frontmatterValue as Record<string, unknown>,
    body: closingMatch[3] ?? ""
  };
}

function readStringField(frontmatter: Record<string, unknown>, field: string): string {
  const value = frontmatter[field];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isValidNameFormat(name: string): boolean {
  if (name.length < 1 || name.length > 64) {
    return false;
  }

  if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
    return false;
  }

  return NAME_PATTERN.test(name);
}
