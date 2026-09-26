import { localButlerLine, type NoteSnippet } from "@/lib/answer";
import { isReactorModel } from "@/lib/reactor";

type RequestBody = {
  question?: unknown;
  notes?: unknown;
  model?: unknown;
  image?: unknown;
};

const IMAGE_LIMIT = 1_800_000;

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Jarvis could not read that." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ error: "Jarvis needs a question." }, { status: 400 });
  }

  const notes = readNotes(body.notes).slice(0, 6);
  const image = readImage(body.image);
  const fallback = image
    ? "I have the picture, sir, but I am working without Grok, so I cannot describe it."
    : localButlerLine(question, notes);
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return Response.json({ line: fallback, source: "notes" });
  }

  const model = readModel(body.model);
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: image ? visionPrompt() : butlerPrompt() },
          { role: "user", content: userContent(question, notes, image) },
        ],
      }),
    });
    if (!response.ok) {
      return Response.json({ line: fallback, source: "notes" });
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const line = data.choices?.[0]?.message?.content?.trim();
    if (!line) {
      return Response.json({ line: fallback, source: "notes" });
    }
    return Response.json({ line, source: "grok", model });
  } catch {
    return Response.json({ line: fallback, source: "notes" });
  }
}

function butlerPrompt(): string {
  return "You are Jarvis, a calm butler. Answer in two short sentences using only the notes provided. Address the user as sir. If the notes do not contain the answer, say you are working from the notes alone and mention what they do say. Do not browse, invent prices, or offer to call anyone.";
}

function visionPrompt(): string {
  return "You are Jarvis, a calm butler with eyes. Describe what you see in two short sentences. Address the user as sir. Do not claim you can click, type, call, or control the computer.";
}

function userContent(question: string, notes: readonly NoteSnippet[], image: string | null): string | object[] {
  const text = image
    ? question
    : `Question: ${question}\n\nNotes:\n${notes.map((note) => `${note.title}: ${note.body}`).join("\n")}`;
  if (!image) {
    return text;
  }
  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: image } },
  ];
}

function readModel(value: unknown): string {
  if (typeof value === "string" && isReactorModel(value)) {
    return value;
  }
  const fromEnv = process.env.XAI_MODEL;
  if (fromEnv && isReactorModel(fromEnv)) {
    return fromEnv;
  }
  return "grok-4";
}

function readImage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.startsWith("data:image/") || value.length > IMAGE_LIMIT) {
    return null;
  }
  return value;
}

function readNotes(value: unknown): NoteSnippet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as { title?: unknown; body?: unknown };
    if (typeof record.title !== "string" || typeof record.body !== "string") {
      return [];
    }
    return [{ title: record.title, body: record.body }];
  });
}
