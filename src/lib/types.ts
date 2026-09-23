export const TOOL_NAMES = [
  "calendar.write",
  "calendar.list",
  "notes.recall",
  "notes.keep",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ReceiptStatus = "done" | "demo" | "failed";

export type Receipt = {
  id: string;
  tool: ToolName;
  title: string;
  input: Record<string, string>;
  outcome: string;
  status: ReceiptStatus;
  at: string;
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
