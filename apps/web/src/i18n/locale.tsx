import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type Messages } from "./en.js";
import { sv } from "./sv.js";

export type Locale = "en" | "sv";

/** Order is the order of the flags in the language switcher. */
export const SUPPORTED_LOCALES: Array<{ id: Locale; name: string }> = [
  { id: "sv", name: "Svenska" },
  { id: "en", name: "English" },
];

export const LOCALE_STORAGE_KEY = "skill-library-locale";

const MESSAGES: Record<Locale, Messages> = { en, sv };
const DATE_LOCALES: Record<Locale, string> = { en: "en-US", sv: "sv-SE" };

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "sv";
}

function readStoredLocale(): Locale | undefined {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** The saved choice wins; otherwise follow the browser, falling back to English. */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = readStoredLocale();
  if (stored) return stored;
  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
  /** BCP 47 tag for formatting dates and numbers. */
  dateLocale: string;
}

// Components rendered without a provider (tests, embeds) get English.
const I18nContext = createContext<I18n>({
  locale: "en",
  setLocale: () => undefined,
  t: en,
  dateLocale: DATE_LOCALES.en,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this visit only.
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: MESSAGES[locale],
      dateLocale: DATE_LOCALES[locale],
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
