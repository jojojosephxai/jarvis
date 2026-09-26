const DEFAULT_VOICE = "rex";

export async function POST(request: Request) {
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return Response.json({ error: "Jarvis could not read that." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "Jarvis needs a line to speak." }, { status: 400 });
  }

  const key = process.env.XAI_API_KEY;
  if (!key) {
    return Response.json({ error: "no-key" }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 1500),
        voice_id: process.env.XAI_VOICE_ID ?? DEFAULT_VOICE,
        language: "en",
        output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
      }),
    });
    if (!response.ok) {
      return Response.json({ error: "voice-failed" }, { status: 502 });
    }
    const audio = await response.arrayBuffer();
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "voice-failed" }, { status: 502 });
  }
}
