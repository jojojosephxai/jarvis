import { grokTtsPublicStatus } from "@/lib/voice/grok-tts";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(grokTtsPublicStatus());
}
