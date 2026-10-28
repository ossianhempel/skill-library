import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_REGISTRY_BRANDING,
  normalizeLogoUrlInput,
  REGISTRY_BRANDING_TEXT_KEYS,
  type RegistryBrandingConfig,
} from "@skill-library/domain";

const BRANDING_KEYS = Object.keys(DEFAULT_REGISTRY_BRANDING) as Array<
  Exclude<keyof RegistryBrandingConfig, "localized">
>;

export function defaultRegistryBrandingConfig(): RegistryBrandingConfig {
  return { ...DEFAULT_REGISTRY_BRANDING };
}

export async function loadRegistryBrandingConfig(
  configPath = resolveConfigPath()
): Promise<RegistryBrandingConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RegistryBrandingConfig>;
    return mergeRegistryBranding(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(
        "registry.config.json not found; using built-in defaults. " +
          "Copy registry.config.example.json to registry.config.json (or run ./scripts/setup-instance-config.sh) to customize branding."
      );
      return defaultRegistryBrandingConfig();
    }

    throw new Error(
      `Failed to load registry branding config from ${configPath}: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

export function mergeRegistryBranding(
  overrides: Partial<RegistryBrandingConfig>
): RegistryBrandingConfig {
  const branding = defaultRegistryBrandingConfig();

  for (const key of BRANDING_KEYS) {
    const value = overrides[key];

    if (key === "logoUrl") {
      const logo = normalizeLogoUrlInput(value);
      if (logo.ok && logo.value !== undefined) {
        branding.logoUrl = logo.value;
      }
    } else if (typeof value === "string" && value.trim()) {
      branding[key] = value.trim();
    }
  }

  const localized = mergeLocalizedBranding(overrides.localized);
  if (localized) {
    branding.localized = localized;
  }

  return branding;
}

/** Keeps only known text fields with non-empty string values, per locale. */
function mergeLocalizedBranding(
  input: unknown
): RegistryBrandingConfig["localized"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const result: NonNullable<RegistryBrandingConfig["localized"]> = {};

  for (const [locale, fields] of Object.entries(input)) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      continue;
    }

    const texts: Record<string, string> = {};
    for (const key of REGISTRY_BRANDING_TEXT_KEYS) {
      const value = (fields as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        texts[key] = value.trim();
      }
    }

    if (Object.keys(texts).length > 0) {
      result[locale] = texts;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveConfigPath(): string {
  const configured = process.env.SKILL_LIBRARY_CONFIG_PATH?.trim();

  if (configured) {
    return resolve(configured);
  }

  return resolve(process.cwd(), "registry.config.json");
}
