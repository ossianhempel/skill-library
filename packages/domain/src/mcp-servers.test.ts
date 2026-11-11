import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  claudeCodeAddCommand,
  codexAddCommand,
  normalizeMcpServerInput,
} from "./mcp-servers.js";

/** Runs a generated command in bash with the CLI replaced by one that prints its arguments. */
function argsWhenPasted(command: string): string[] {
  const output = execFileSync(
    "bash",
    [
      "-c",
      `claude() { printf '%s\\n' "$@"; }; codex() { claude "$@"; }; ${command}`,
    ],
    { encoding: "utf8" }
  );
  return output.trimEnd().split("\n");
}

describe("connect commands", () => {
  it("leave a plain URL readable", () => {
    expect(
      claudeCodeAddCommand({
        slug: "brain",
        url: "https://brain.example.com/mcp",
      })
    ).toBe(
      "claude mcp add --transport http --scope user brain https://brain.example.com/mcp"
    );
  });

  it("pass a URL with shell characters to the CLI as one argument and run nothing else", () => {
    const url = "https://example.com/mcp;printf${IFS}INJECTED&x='1'";
    const checked = normalizeMcpServerInput({
      name: "x",
      description: "x",
      url,
    });
    expect(checked.ok).toBe(true);

    for (const command of [
      claudeCodeAddCommand({ slug: "x", url }),
      codexAddCommand({ slug: "x", url }),
    ]) {
      const args = argsWhenPasted(command);
      expect(args.at(-1)).toBe(url);
      expect(args).not.toContain("INJECTED");
    }
  });
});
