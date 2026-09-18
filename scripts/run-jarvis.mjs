#!/usr/bin/env node
/**
 * One command starts the HUD and the live-brain bridge.
 * Keys stay in `.env`; the HUD never sees them.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");

/** @type {import("node:child_process").ChildProcess[]} */
const kids = [];
let shutting = false;

function run(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (shutting) return;
    shutting = true;
    for (const k of kids) {
      if (k !== child && !k.killed) k.kill("SIGTERM");
    }
    process.exit(signal ? 1 : (code ?? 1));
  });
  kids.push(child);
}

function shutdown() {
  if (shutting) return;
  shutting = true;
  for (const k of kids) {
    if (!k.killed) k.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Jarvis HUD  → http://localhost:8787");
console.log("Jarvis brain → http://127.0.0.1:8790  (keys from .env, never the HUD)");
run([path.join(root, "bridge", "server.mjs")]);
run([vite, "--config", path.join(root, "hud", "vite.config.ts"), "--host", "0.0.0.0", "--port", "8787"]);
