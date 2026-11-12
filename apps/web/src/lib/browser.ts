import type { AppTab } from "../types.js";

export function isLocalDev(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

export function browserToken(): string | undefined {
  if (typeof window === "undefined" || !window.localStorage) {
    return undefined;
  }
  const token = window.localStorage.getItem("skill-library-token");
  if (token) {
    return token;
  }

  return undefined;
}

/** `?tab=mcps` opens the MCPs tab, so the MCP tools can link straight to it. */
export function initialTab(): AppTab {
  if (typeof window === "undefined") return "overview";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "mcps" ? "mcps" : "overview";
}
