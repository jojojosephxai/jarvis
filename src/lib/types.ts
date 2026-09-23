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

export type BriefLine = {
  note: string;
  line: string;
};

export type BriefGap = {
  note: string;
  field: string;
};

export type BriefEvent = {
  title: string;
  when: string;
};

export type MorningBrief = {
  at: string;
  heading: string;
  calendarEmpty: boolean;
  calendarNote: string;
  events: BriefEvent[];
  hiddenEvents: number;
  vaultThin: boolean;
  vaultNote: string;
  priorities: BriefLine[];
  gaps: BriefGap[];
  checked: string[];
  sources: string[];
  mail: string;
  escalate: string | null;
  reply: string;
  notice: string;
};

export type ChatResponse = {
  reply: string;
  mode: BrainMode;
  receipts: Receipt[];
  plan?: HandPlan;
  notice?: string;
  sources?: string[];
  brief?: MorningBrief;
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

function isBriefEvent(value: unknown): value is BriefEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<BriefEvent>;
  return typeof event.title === "string" && typeof event.when === "string";
}

function isBriefLine(value: unknown): value is BriefLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<BriefLine>;
  return typeof line.note === "string" && typeof line.line === "string";
}

function isBriefGap(value: unknown): value is BriefGap {
  if (!value || typeof value !== "object") return false;
  const gap = value as Partial<BriefGap>;
  return typeof gap.note === "string" && typeof gap.field === "string";
}

export function isMorningBrief(value: unknown): value is MorningBrief {
  if (!value || typeof value !== "object") return false;
  const brief = value as Partial<MorningBrief>;
  return (
    typeof brief.at === "string" &&
    typeof brief.heading === "string" &&
    typeof brief.calendarEmpty === "boolean" &&
    typeof brief.calendarNote === "string" &&
    Array.isArray(brief.events) &&
    brief.events.every(isBriefEvent) &&
    typeof brief.hiddenEvents === "number" &&
    typeof brief.vaultThin === "boolean" &&
    typeof brief.vaultNote === "string" &&
    Array.isArray(brief.priorities) &&
    brief.priorities.every(isBriefLine) &&
    Array.isArray(brief.gaps) &&
    brief.gaps.every(isBriefGap) &&
    Array.isArray(brief.checked) &&
    brief.checked.every((entry) => typeof entry === "string") &&
    Array.isArray(brief.sources) &&
    brief.sources.every((entry) => typeof entry === "string") &&
    typeof brief.mail === "string" &&
    (brief.escalate === null || typeof brief.escalate === "string") &&
    typeof brief.reply === "string" &&
    typeof brief.notice === "string"
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
