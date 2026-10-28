import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY_BRANDING } from "@skill-library/domain";
import {
  loadRegistryBrandingConfig,
  mergeRegistryBranding,
} from "./registry-config.js";

describe("registry-config", () => {
  it("merges partial overrides onto defaults", () => {
    expect(
      mergeRegistryBranding({
        companyName: "Rebtech",
        registryTagline: "Rebtech skill registry",
        registryPublicUrl: "https://skills.rebtech.se",
        logoUrl: "https://skills.rebtech.se/logo.svg",
      })
    ).toEqual({
      ...DEFAULT_REGISTRY_BRANDING,
      companyName: "Rebtech",
      registryTagline: "Rebtech skill registry",
      registryPublicUrl: "https://skills.rebtech.se",
      logoUrl: "https://skills.rebtech.se/logo.svg",
    });
  });

  it("ignores unsupported logo config values", () => {
    expect(
      mergeRegistryBranding({
        logoUrl: "javascript:alert(1)",
      }).logoUrl
    ).toBe("");
  });

  it("keeps per-language text overrides and drops anything else", () => {
    expect(
      mergeRegistryBranding({
        localized: {
          sv: {
            overviewHeading: "  Hitta en skill  ",
            registryPublicUrl: "https://evil.example",
            loginSubtitle: "",
          },
          de: "not an object",
        },
      } as never).localized
    ).toEqual({ sv: { overviewHeading: "Hitta en skill" } });
  });

  it("falls back to defaults when the config file is missing", async () => {
    const dir = await mkdtemp(
      join(tmpdir(), "skill-library-branding-missing-")
    );
    const configPath = join(dir, "missing-registry.config.json");

    await expect(loadRegistryBrandingConfig(configPath)).resolves.toEqual(
      DEFAULT_REGISTRY_BRANDING
    );
  });

  it("loads branding from a JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-library-branding-"));
    const configPath = join(dir, "registry.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        appName: "Rebtech Skills",
        registryTagline: "Rebtech skill registry",
      })
    );

    await expect(loadRegistryBrandingConfig(configPath)).resolves.toEqual({
      ...DEFAULT_REGISTRY_BRANDING,
      appName: "Rebtech Skills",
      registryTagline: "Rebtech skill registry",
    });
  });
});
