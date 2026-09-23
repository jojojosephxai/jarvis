import { isHandPlan, isReceipt, type HandPlan, type Receipt } from "./types";

export type ThreadEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  receipts: Receipt[];
  plan?: HandPlan;
  notice?: string;
  failed?: boolean;
};

const STORAGE_KEY = "jarvis-thread-v1";
const EMPTY: ThreadEntry[] = [];

let cachedRaw: string | null = null;
let cached: ThreadEntry[] = EMPTY;
const listeners = new Set<() => void>();

function isThreadEntry(value: unknown): value is ThreadEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ThreadEntry>;
  return (
    typeof entry.id === "string" &&
    (entry.role === "user" || entry.role === "assistant") &&
    typeof entry.text === "string" &&
    typeof entry.at === "string" &&
    Array.isArray(entry.receipts) &&
    entry.receipts.every(isReceipt) &&
    (entry.plan === undefined || isHandPlan(entry.plan))
  );
}

function readStored(): ThreadEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  if (!raw) {
    cached = EMPTY;
    return cached;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    cached = Array.isArray(parsed) ? parsed.filter(isThreadEntry).slice(-30) : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

export function subscribeThread(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThreadSnapshot(): ThreadEntry[] {
  return readStored();
}

export function getThreadServerSnapshot(): ThreadEntry[] {
  return EMPTY;
}

export function saveThread(items: ThreadEntry[]) {
  const next = items.slice(-30);
  const raw = JSON.stringify(next);
  cached = next;
  cachedRaw = raw;
  localStorage.setItem(STORAGE_KEY, raw);
  for (const listener of listeners) listener();
}
