export const FACE_VIEWS = ["orb", "graph", "ring", "cube"] as const;

export type FaceView = (typeof FACE_VIEWS)[number];

const VIEW_COMMAND =
  /^(?:please\s+)?(?:can you\s+)?(?:switch\s+view\s+to|switch(?:\s+to)?|show(?:\s+me)?|open|go to|use|put it on)?\s*(?:the\s+)?(orb|graph|ring|cube)(?:\s+(?:mode|view|screen))?$/i;

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^(?:hey|hi|ok|okay|jarvis)[,!\s]+/i, "")
    .trim();
}

function asFaceView(value: string | undefined): FaceView | null {
  switch (value) {
    case "orb":
    case "graph":
    case "ring":
    case "cube":
      return value;
    default:
      return null;
  }
}

export function parseViewIntent(text: string): FaceView | null {
  const match = VIEW_COMMAND.exec(normalize(text));
  return asFaceView(match?.[1]?.toLowerCase());
}

export function viewLabel(view: FaceView): string {
  switch (view) {
    case "orb":
      return "Orb";
    case "graph":
      return "Graph";
    case "ring":
      return "Ring";
    case "cube":
      return "Cube";
    default: {
      const neverView: never = view;
      return neverView;
    }
  }
}
