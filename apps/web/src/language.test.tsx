import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REGISTRY_BRANDING } from "@skill-library/domain";
import { SkillLibraryApp } from "./ui.js";
import { LOCALE_STORAGE_KEY } from "./i18n/locale.js";
import { localizeBranding } from "./i18n/branding.js";
import { skill } from "./ui-test-fixtures.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const branding = {
  ...DEFAULT_REGISTRY_BRANDING,
  registryPublicUrl: "https://skills.example.com",
};

function renderApp() {
  return render(<SkillLibraryApp skills={[skill]} branding={branding} />);
}

describe("language switcher", () => {
  it("shows both flags on the start page and switches the UI to Swedish", () => {
    renderApp();

    const english = screen.getByRole("button", { name: "English" });
    const swedish = screen.getByRole("button", { name: "Svenska" });
    expect(english.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("How it works")).toBeTruthy();

    fireEvent.click(swedish);

    expect(swedish.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Så funkar det")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Katalog" })).toBeTruthy();
    expect(
      screen.getByText("Hitta en skill och lägg till den i Claude.")
    ).toBeTruthy();
    expect(document.documentElement.lang).toBe("sv");
  });

  it("remembers the choice for the next visit", () => {
    const first = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Svenska" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("sv");
    first.unmount();

    renderApp();
    expect(screen.getByText("Så funkar det")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("starts in Swedish for a Swedish browser with no saved choice", () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      language: "sv-SE",
      languages: ["sv-SE", "en-US"],
    });

    renderApp();

    expect(screen.getByText("Så funkar det")).toBeTruthy();
  });

  it("translates the skill detail and its lifecycle badge", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "sv");
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Katalog" }));

    expect(screen.getByText("Lägg till skillen i Claude")).toBeTruthy();
    expect(screen.getAllByText("godkänd").length).toBeGreaterThan(0);
  });
});

describe("localizeBranding", () => {
  it("uses configured translations, built-in ones for defaults, and keeps custom copy", () => {
    const custom = {
      ...DEFAULT_REGISTRY_BRANDING,
      overviewDescription: "Custom English description.",
      loginSubtitle: "Sign in with your Acme account.",
      localized: { sv: { loginSubtitle: "Logga in med ditt Acme-konto." } },
    };

    const sv = localizeBranding(custom, "sv");

    expect(sv.loginSubtitle).toBe("Logga in med ditt Acme-konto.");
    expect(sv.overviewHeading).toBe(
      "Hitta en skill och lägg till den i Claude."
    );
    expect(sv.overviewDescription).toBe("Custom English description.");
    expect(sv.appName).toBe(DEFAULT_REGISTRY_BRANDING.appName);
    expect(localizeBranding(custom, "en")).toEqual(custom);
  });
});
