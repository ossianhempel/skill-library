export function isLocalDev(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

export function browserToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const token = window.localStorage.getItem("skill-library-token");
  if (token) {
    return token;
  }

  return undefined;
}
