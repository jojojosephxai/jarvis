import { brainMode, grokConfigured, grokModel } from "@/lib/grok";

export async function GET() {
  const mode = brainMode();
  return Response.json({
    mode,
    model: grokConfigured() ? grokModel() : null,
  });
}
