import {
  DEFAULT_REGISTRY_BRANDING,
  REGISTRY_BRANDING_TEXT_KEYS,
  type RegistryBrandingConfig,
  type RegistryBrandingTextKey,
} from "@skill-library/domain";
import type { Locale } from "./locale.js";

/** Swedish versions of the built-in branding copy. Brand names stay as they are. */
const BUILT_IN_BRANDING: Partial<
  Record<Locale, Partial<Record<RegistryBrandingTextKey, string>>>
> = {
  sv: {
    registryTagline: "Internt skill-register",
    loginSubtitle:
      "Logga in med ditt jobbkonto för att bläddra bland, publicera och hantera skills.",
    overviewHeading: "Hitta en skill och lägg till den i Claude.",
    overviewDescription:
      "Skills lär Claude hur ditt team jobbar. Välj en, ladda ner den och lägg till den i Claude på ett par minuter. Har du gjort något användbart? Dela det här.",
    searchPlaceholder: "Sök bland godkända skills",
    emptyCatalogTitle: "Registret är tomt.",
    emptyCatalogDescription:
      "Ladda upp ett skill-paket eller importera ett från Git för att fylla katalogen.",
    emptyCatalogListMessage:
      "Inga godkända skills än. Publicera ett utkast och godkänn det för att visa det här.",
    uploadDescription:
      "Ladda upp en skill-mapp från din dator. Mappen måste ha en SKILL.md-fil i roten.",
  },
};

/**
 * Picks the branding copy for a locale. A configured `localized` value wins.
 * Otherwise a field still set to the English default gets the built-in
 * translation, and a custom value stays as configured.
 */
export function localizeBranding(
  branding: RegistryBrandingConfig,
  locale: Locale
): RegistryBrandingConfig {
  const configured = branding.localized?.[locale] ?? {};
  const builtIn = BUILT_IN_BRANDING[locale] ?? {};
  const result = { ...branding };

  for (const key of REGISTRY_BRANDING_TEXT_KEYS) {
    const override = configured[key];
    if (override) {
      result[key] = override;
    } else if (
      builtIn[key] &&
      branding[key] === DEFAULT_REGISTRY_BRANDING[key]
    ) {
      result[key] = builtIn[key];
    }
  }

  return result;
}
