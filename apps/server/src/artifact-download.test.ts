import { describe, expect, it } from "vitest";
import {
  packPackageZip,
  readPackageZipBuffer,
} from "@skill-library/validation";
import { artifactDownloadResponse } from "./artifact-download.js";

const artifact = {
  digest: "sha256:abc",
  storagePath: "ab/abc.zip",
  sizeBytes: 1,
  createdAt: "2026-10-18T00:00:00.000Z",
};

async function storedZip() {
  return packPackageZip([
    {
      path: "SKILL.md",
      content: "---\nname: review-helper\ndescription: Reviews.\n---\n# Hi\n",
    },
  ]);
}

describe("artifactDownloadResponse", () => {
  it("returns the stored artifact named by digest by default", async () => {
    const content = await storedZip();
    const response = await artifactDownloadResponse(
      { artifact, content },
      undefined,
      "review-helper"
    );

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="sha256-abc.zip"'
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
  });

  it("returns a Claude-app ZIP named after the skill for layout=claude-app", async () => {
    const response = await artifactDownloadResponse(
      { artifact, content: await storedZip() },
      "claude-app",
      "review-helper"
    );
    const entries = await readPackageZipBuffer(
      Buffer.from(await response.arrayBuffer())
    );

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="review-helper.zip"'
    );
    expect(entries.map((entry) => entry.path)).toEqual([
      "review-helper/SKILL.md",
    ]);
  });

  it("names the file after the slug even when the skill name differs", async () => {
    const response = await artifactDownloadResponse(
      { artifact, content: await storedZip() },
      "claude-app",
      "team-review"
    );
    const entries = await readPackageZipBuffer(
      Buffer.from(await response.arrayBuffer())
    );

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="team-review.zip"'
    );
    expect(entries.map((entry) => entry.path)).toEqual([
      "review-helper/SKILL.md",
    ]);
  });

  it("answers 422 when the artifact cannot be repackaged", async () => {
    const response = await artifactDownloadResponse(
      {
        artifact,
        content: await packPackageZip([{ path: "a.txt", content: "a" }]),
      },
      "claude-app",
      "x"
    );

    expect(response.status).toBe(422);
  });
});
