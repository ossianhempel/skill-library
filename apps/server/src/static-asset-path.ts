import { isAbsolute, join, relative, resolve } from "node:path";

export function resolveStaticAssetPath(staticDir: string, pathname: string): string | undefined {
  const root = resolve(staticDir);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(join(root, requestedPath));
  const relativePath = relative(root, candidate);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return undefined;
  }

  return candidate;
}
