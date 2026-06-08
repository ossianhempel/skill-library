import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_REGISTRY_BRANDING, type RegistryBrandingConfig } from "@skill-library/domain";

const BRANDING_KEYS = Object.keys(DEFAULT_REGISTRY_BRANDING) as Array<keyof RegistryBrandingConfig>;

export function defaultRegistryBrandingConfig(): RegistryBrandingConfig {
  return { ...DEFAULT_REGISTRY_BRANDING };
}

export async function loadRegistryBrandingConfig(configPath = resolveConfigPath()): Promise<RegistryBrandingConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RegistryBrandingConfig>;
    return mergeRegistryBranding(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultRegistryBrandingConfig();
    }

    throw new Error(`Failed to load registry branding config from ${configPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function mergeRegistryBranding(overrides: Partial<RegistryBrandingConfig>): RegistryBrandingConfig {
  const branding = defaultRegistryBrandingConfig();

  for (const key of BRANDING_KEYS) {
    const value = overrides[key];

    if (typeof value === "string" && value.trim()) {
      branding[key] = value.trim();
    }
  }

  return branding;
}

function resolveConfigPath(): string {
  const configured = process.env.SKILL_LIBRARY_CONFIG_PATH?.trim();

  if (configured) {
    return resolve(configured);
  }

  return resolve(process.cwd(), "registry.config.json");
}
