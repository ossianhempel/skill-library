export function nodeResponseHeaders(appResponse: Response): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};

  appResponse.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") {
      return;
    }

    headers[name] = value;
  });

  const setCookies =
    typeof appResponse.headers.getSetCookie === "function"
      ? appResponse.headers.getSetCookie()
      : appResponse.headers.get("set-cookie")
        ? [appResponse.headers.get("set-cookie")!]
        : [];

  if (setCookies.length === 1) {
    headers["set-cookie"] = setCookies[0]!;
  } else if (setCookies.length > 1) {
    headers["set-cookie"] = setCookies;
  }

  return headers;
}
