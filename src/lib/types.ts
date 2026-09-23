export const TOOL_NAMES = [
  "calendar.write",
  "calendar.list",
  "calendar.delete",
  "notes.recall",
  "notes.keep",
  "browser.open",
  "browser.task",
  "message.send",
  "money.spend",
  "item.delete",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const RECEIPT_STATUSES = ["done", "demo", "failed", "stub", "declined", "blocked"] as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export type Receipt = {
  id: string;
  tool: ToolName;
  title: string;
  input: Record<string, string>;
  outcome: string;
  status: ReceiptStatus;
  at: string;
};

export const HAND_GATES = ["auto", "confirm"] as const;

export type HandGate = (typeof HAND_GATES)[number];

export const PLAN_STATES = ["waiting", "approved", "declined"] as const;

export type PlanState = (typeof PLAN_STATES)[number];

export type HandPlan = {
  id: string;
  tool: ToolName;
  title: string;
  steps: string[];
  input: Record<string, string>;
  gate: HandGate;
  state: PlanState;
};

export type ToolRequest = {
  tool: ToolName;
  input: Record<string, string>;
};

export type ChatRole = "user" | "assistant";

export type ChatMessageInput = {
  role: ChatRole;
  content: string;
};

export type BrainMode = "grok" | "demo";

export type ChatResponse = {
  reply: string;
  mode: BrainMode;
  receipts: Receipt[];
  plan?: HandPlan;
  notice?: string;
  sources?: string[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  when: string;
  detail: string;
  createdAt: string;
};

export type MemorySource = "local-notes" | "obsidian-vault";

export type MemoryHit = {
  id: string;
  title: string;
  excerpt: string;
  source: MemorySource;
};

export function isToolName(value: unknown): value is ToolName {
  return (
    typeof value === "string" &&
    (TOOL_NAMES as readonly string[]).includes(value)
  );
}

export function isReceiptStatus(value: unknown): value is ReceiptStatus {
  return (
    typeof value === "string" &&
    (RECEIPT_STATUSES as readonly string[]).includes(value)
  );
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Receipt>;
  return (
    typeof receipt.id === "string" &&
    isToolName(receipt.tool) &&
    typeof receipt.title === "string" &&
    typeof receipt.outcome === "string" &&
    typeof receipt.at === "string" &&
    isReceiptStatus(receipt.status) &&
    isStringRecord(receipt.input)
  );
}

export function isHandPlan(value: unknown): value is HandPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<HandPlan>;
  return (
    typeof plan.id === "string" &&
    isToolName(plan.tool) &&
    typeof plan.title === "string" &&
    Array.isArray(plan.steps) &&
    plan.steps.every((step) => typeof step === "string") &&
    isStringRecord(plan.input) &&
    (plan.gate === "auto" || plan.gate === "confirm") &&
    (plan.state === "waiting" || plan.state === "approved" || plan.state === "declined")
  );
}
