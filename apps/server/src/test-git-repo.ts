import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitCommandEnv } from "./git-import.js";

const execFileAsync = promisify(execFile);

export function skillMd(
  name: string,
  description: string,
  body = "# Skill\n\nBody content.\n"
): string {
  return `---
name: ${name}
description: ${description}
---
${body}`;
}

export async function createGitSkillRepo(repoPath: string) {
  const skillPath = join(repoPath, "skills", "git-skill");

  await mkdir(skillPath, { recursive: true });
  await writeFile(
    join(skillPath, "SKILL.md"),
    skillMd("git-skill", "Imported from Git.", "# Git skill\n")
  );
  await execFileAsync("git", ["init"], { cwd: repoPath, env: gitCommandEnv() });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath,
    env: gitCommandEnv(),
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: repoPath,
    env: gitCommandEnv(),
  });
  await execFileAsync("git", ["add", "."], {
    cwd: repoPath,
    env: gitCommandEnv(),
  });
  await execFileAsync("git", ["commit", "-m", "Add skill"], {
    cwd: repoPath,
    env: gitCommandEnv(),
  });

  return repoPath;
}
