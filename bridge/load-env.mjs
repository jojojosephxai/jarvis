import fs from "node:fs";
import path from "node:path";

/**
 * Parse a dotenv-style file. Does not execute anything.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load `.env` from `root` into `env` without overriding non-empty values
 * already set (so a real shell export still wins).
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadEnv(root, env = process.env) {
  const file = path.join(root, ".env");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { loaded: false, keys: [] };
  }
  const parsed = parseEnv(text);
  const keys = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
      keys.push(key);
    }
  }
  return { loaded: true, keys };
}
