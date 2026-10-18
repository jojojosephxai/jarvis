import { warmGrokConnection } from "@/lib/grok";
import { grokTtsPublicStatus, warmTtsConnection } from "@/lib/voice/grok-tts";

export const dynamic = "force-dynamic";

export async function GET() {
  warmGrokConnection();
  warmTtsConnection();
  return Response.json(grokTtsPublicStatus());
}
