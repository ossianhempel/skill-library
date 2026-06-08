import { describe, expect, it } from "vitest";
import { resolveStaticAssetPath } from "./static-asset-path.js";

describe("resolveStaticAssetPath", () => {
  it("rejects paths that escape the static root via prefix tricks", () => {
    const root = "/app/web/dist";

    expect(resolveStaticAssetPath(root, "/../dist-private/secret.txt")).toBeUndefined();
    expect(resolveStaticAssetPath(root, "/assets/app.js")).toBe("/app/web/dist/assets/app.js");
  });
});
