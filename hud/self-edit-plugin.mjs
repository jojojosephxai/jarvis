import fs from "node:fs/promises";
import path from "node:path";
import { sanitize, withDefaults } from "./js/settings.js";

const SETTINGS_FILE = "jarvis.settings.json";
const MAX_BODY = 8 * 1024;

/**
 * Lets the HUD rewrite its own settings file.
 *
 * This is the only thing in the project that can write to disk, and it is
 * deliberately tiny: it serves one file, accepts only keys in the settings
 * schema, and clamps every value. It cannot write anywhere else, cannot run
 * commands, and `apply: "serve"` keeps it out of any production build.
 *
 * `npm run jarvis` binds 0.0.0.0 so Joseph can open the HUD from his phone,
 * which means this endpoint is reachable from his LAN. The schema is what makes
 * that acceptable: the worst a stranger on the wifi can do is change the accent
 * colour, and `git diff` shows it. The origin check below is the part that
 * matters — it stops a random website he visits from posting here behind his back.
 */
export function jarvisSelfEdit() {
  let settingsPath = "";

  const read = async () => {
    try {
      return withDefaults(JSON.parse(await fs.readFile(settingsPath, "utf8")));
    } catch {
      return withDefaults({}); // missing or corrupt — fall back to how it shipped
    }
  };

  const json = (res, status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  /** Same-origin only, and never a simple cross-site form post. */
  const trusted = (req) => {
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin") return false;
    if (req.headers["x-jarvis-self-edit"] !== "1") return false;
    return String(req.headers["content-type"] || "").includes("application/json");
  };

  const body = (req) =>
    new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > MAX_BODY) reject(new Error("body too large"));
      });
      req.on("end", () => resolve(raw));
      req.on("error", reject);
    });

  return {
    name: "jarvis-self-edit",
    apply: "serve",

    configResolved(config) {
      settingsPath = path.join(config.root, SETTINGS_FILE);
    },

    configureServer(server) {
      server.middlewares.use("/__jarvis/settings", async (req, res) => {
        if (req.method === "GET") {
          json(res, 200, await read());
          return;
        }

        if (req.method !== "POST") {
          json(res, 405, { error: "GET or POST only" });
          return;
        }

        if (!trusted(req)) {
          json(res, 403, { error: "self-edit requests must come from the HUD itself" });
          return;
        }

        try {
          const patch = sanitize(JSON.parse(await body(req)));
          if (!Object.keys(patch).length) {
            json(res, 400, { error: "no recognised settings in that request" });
            return;
          }
          const next = { ...(await read()), ...patch };
          try {
            await fs.writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
          } catch (err) {
            json(res, 500, { error: err instanceof Error ? err.message : "write failed" });
            return;
          }
          json(res, 200, { settings: next, wrote: Object.keys(patch) });
        } catch (err) {
          json(res, 400, { error: err instanceof Error ? err.message : "bad request" });
        }
      });
    },
  };
}
