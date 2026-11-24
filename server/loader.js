import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Loads a teammate's module if its file exists, otherwise returns the temporary fallback.
export async function load(relativePath, fallback) {
  const url = new URL(relativePath, import.meta.url);
  if (fs.existsSync(fileURLToPath(url))) {
    return await import(url.href); // real module (real errors are NOT hidden)
  }
  console.warn(`[loader] ${relativePath} not found yet -> using temporary fallback`);
  return fallback;
}