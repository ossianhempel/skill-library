import { packPackageZip, readPackageZipBuffer } from "./index.js";
import { readSkillName } from "./skill-md.js";

const FALLBACK_FOLDER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Repackages a stored skill artifact into the layout the Claude apps expect
 * when a user uploads a skill (claude.ai or the desktop app, under
 * Customize > Skills): one top-level folder, named after the skill, holding
 * SKILL.md and its files. Stored artifacts keep SKILL.md wherever the uploader
 * put it, often at the ZIP root, which the Claude apps reject.
 *
 * The folder name is the SKILL.md frontmatter name when it is valid, else
 * `fallbackName` when it is a safe slug, else "skill". Entries outside the
 * skill root are dropped; they are not part of the skill.
 */
export async function packForClaudeApp(
  archive: Buffer,
  fallbackName: string
): Promise<{ content: Buffer; folder: string }> {
  const entries = await readPackageZipBuffer(archive);
  const skillMd = entries.filter(
    (entry) =>
      entry.kind !== "directory" &&
      (entry.path === "SKILL.md" || entry.path.endsWith("/SKILL.md"))
  );

  if (skillMd.length !== 1) {
    throw new Error("Artifact must contain exactly one SKILL.md.");
  }

  const skillMdEntry = skillMd[0]!;
  const root = skillMdEntry.path.slice(0, -"SKILL.md".length);
  const folder =
    readSkillName(Buffer.from(skillMdEntry.content ?? "").toString("utf8")) ??
    (FALLBACK_FOLDER_PATTERN.test(fallbackName) ? fallbackName : "skill");

  const rerooted = entries
    .filter((entry) => entry.path.startsWith(root) && entry.path !== root)
    .map((entry) => ({
      ...entry,
      path: `${folder}/${entry.path.slice(root.length)}`,
    }));

  return { content: await packPackageZip(rerooted), folder };
}
