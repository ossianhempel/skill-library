import type { StoredArtifact } from "@skill-library/storage";
import { packForClaudeApp } from "@skill-library/validation";

const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Builds the artifact download response. `layout=claude-app` returns a ZIP the
 * Claude apps accept as an uploaded skill (one folder named after the skill),
 * saved as `<slug>.zip` so it matches the filename the web UI tells the user to
 * look for in their Downloads folder. The folder inside keeps the SKILL.md
 * name, which is what Claude checks. Any other layout returns the stored artifact unchanged.
 */
export async function artifactDownloadResponse(
  download: { artifact: StoredArtifact; content: Buffer },
  layout: string | undefined,
  slug: string
): Promise<Response> {
  if (layout !== "claude-app") {
    return zipResponse(
      download.content,
      `${download.artifact.digest.replace(":", "-")}.zip`
    );
  }

  try {
    const { content, folder } = await packForClaudeApp(download.content, slug);
    const filename = SAFE_SLUG_PATTERN.test(slug) ? slug : folder;
    return zipResponse(content, `${filename}.zip`);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 422 }
    );
  }
}

function zipResponse(content: Buffer, filename: string): Response {
  return new Response(new Uint8Array(content), {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "application/zip",
    },
  });
}
