import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PackageJson {
  version: string;
}

/** Reads and caches the package version from the nearest package.json. */
let cachedVersion: string | undefined;

export function getVersion(): string {
  if (cachedVersion === undefined) {
    const packageJsonPath = path.resolve(__dirname, "..", "package.json");
    const raw = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(raw) as PackageJson;
    cachedVersion = pkg.version;
  }
  return cachedVersion;
}
