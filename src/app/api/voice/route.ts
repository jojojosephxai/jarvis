import { voiceStatus } from "@/lib/voice/azure";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(voiceStatus());
}
