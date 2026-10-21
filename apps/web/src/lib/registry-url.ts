const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function isLocalUrl(value: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * The registry address shown in copied prompts and commands, which other
 * machines and agents call. An explicit API URL wins. Otherwise the configured
 * public URL, unless it is still the localhost default, in which case the
 * address the user is browsing is used: the web app and the API share an
 * origin, so that is the API that just served them.
 */
export function resolveRegistryBaseUrl(
  registryUrl: string,
  branding: { registryPublicUrl: string },
  origin = typeof window !== "undefined" ? window.location.origin : ""
): string {
  const explicit = registryUrl.trim();
  if (explicit) {
    return explicit;
  }

  const configured = branding.registryPublicUrl.trim();
  if (configured && (!isLocalUrl(configured) || !origin)) {
    return configured;
  }

  return origin || configured;
}
