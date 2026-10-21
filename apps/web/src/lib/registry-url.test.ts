import { describe, expect, it } from "vitest";
import { resolveRegistryBaseUrl } from "./registry-url.js";

describe("resolveRegistryBaseUrl", () => {
  it("prefers an explicit API URL", () => {
    expect(
      resolveRegistryBaseUrl(
        "https://api.example.com",
        { registryPublicUrl: "https://skills.example.com" },
        "https://skills.example.com"
      )
    ).toBe("https://api.example.com");
  });

  it("uses the configured public URL", () => {
    expect(
      resolveRegistryBaseUrl(
        "",
        { registryPublicUrl: "https://skills.example.com" },
        "https://internal.example.net"
      )
    ).toBe("https://skills.example.com");
  });

  it("never hands a deployed user the localhost default", () => {
    expect(
      resolveRegistryBaseUrl(
        "",
        { registryPublicUrl: "http://localhost:3000" },
        "https://skills.rebtech.se"
      )
    ).toBe("https://skills.rebtech.se");
  });
});
