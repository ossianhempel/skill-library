import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { gitCommandEnv } from "./git-import.js";

const execFileAsync = promisify(execFile);

describe("git import command environment", () => {
  it("clears every local Git environment variable before spawning Git", async () => {
    const { stdout } = await execFileAsync("git", [
      "rev-parse",
      "--local-env-vars",
    ]);
    const localGitEnvKeys = stdout.trim().split(/\r?\n/).filter(Boolean);
    const inheritedEnv = Object.fromEntries(
      localGitEnvKeys.map((key) => [key, "leaked"])
    );

    const sanitized = gitCommandEnv({
      ...inheritedEnv,
      PATH: "/usr/bin",
    });

    expect(localGitEnvKeys).toEqual(
      expect.arrayContaining([
        "GIT_OBJECT_DIRECTORY",
        "GIT_COMMON_DIR",
        "GIT_CONFIG",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      ])
    );
    for (const key of localGitEnvKeys) {
      expect(sanitized).not.toHaveProperty(key);
    }
    expect(sanitized.PATH).toBe("/usr/bin");
  });
});
