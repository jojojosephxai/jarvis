import { voiceSessionResponse } from "@/lib/voice/realtime-config";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return voiceSessionResponse(request);
}
