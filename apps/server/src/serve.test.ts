import { describe, expect, it } from "vitest";
import { nodeResponseHeaders } from "./node-response-headers.js";

describe("nodeResponseHeaders", () => {
  it("preserves multiple Set-Cookie headers", () => {
    const appResponse = new Response(null, {
      status: 302,
      headers: [
        ["content-type", "text/plain"],
        ["set-cookie", "session=a; Path=/; HttpOnly"],
        ["set-cookie", "state=b; Path=/; HttpOnly"]
      ]
    });

    expect(nodeResponseHeaders(appResponse)).toEqual({
      "content-type": "text/plain",
      "set-cookie": [
        "session=a; Path=/; HttpOnly",
        "state=b; Path=/; HttpOnly"
      ]
    });
  });
});
