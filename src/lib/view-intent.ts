export const FACE_VIEWS = ["graph", "orb"] as const;

export type FaceView = (typeof FACE_VIEWS)[number];

export type FaceModeKind = "phrase" | "vault" | "auto";

export type FaceModeDecision = {
  view: FaceView;
  exclusive: boolean;
  kind: FaceModeKind;
  focusQuery?: string;
  pathFrom?: string;
  pathTo?: string;
};

const VIEW_COMMAND =
  /^(?:please\s+)?(?:can you\s+)?(?:switch\s+view\s+to|switch(?:\s+to)?|show(?:\s+me)?|open|go to|use|put it on)?\s*(?:the\s+)?(dynamic\s+orb|orb|graph)(?:\s+(?:mode|view|screen))?$/i;

const DYNAMIC_ORB_WINS = /\bswitch\s+to\s+(?:the\s+)?dynamic\s+orb\b/i;

const PATH_ASK =
  /^(?:please\s+)?(?:can you\s+)?(?:show(?:\s+me)?|highlight|trace|open)?\s*(?:the\s+)?(?:path|route)\s+(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)$/i;

const CONNECTED_ASK = /^(?:please\s+)?how\s+(?:is|are)\s+(.+?)\s+connected\s+to\s+(.+?)$/i;

const FOCUS_NOTE = /^(?:please\s+)?(?:can you\s+)?(?:focus|find|locate)\s+(?:the\s+)?note\s+(.+?)$/i;

const SEARCH_GRAPH = /^(?:please\s+)?(?:can you\s+)?search\s+(?:the\s+)?graph(?:\s+for)?\s+(.+?)$/i;

const CONNECTIONS =
  /^(?:please\s+)?(?:can you\s+)?(?:show(?:\s+me)?\s+)?(?:the\s+)?(?:connections|links|wikilinks)\s+(?:for|around|to|from)\s+(.+?)$/i;

const VAULT_OPEN =
  /^(?:please\s+)?(?:can you\s+)?(?:show(?:\s+me)?|open|pull up|go to|see|view)\s+(?:the\s+|my\s+)?(?:vault|note graph|notes graph|vault graph|graph of (?:my )?notes)$/i;

const HUBS_ASK =
  /^(?:please\s+)?(?:can you\s+)?(?:show(?:\s+me)?\s+)?(?:the\s+)?(?:top hubs|most connected(?:\s+notes)?|note hubs|hubs)$/i;

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^(?:hey|hi|ok|okay|jarvis)[,!\s]+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function clipName(value: string): string {
  return value.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").trim();
}

function asFaceView(value: string | undefined): FaceView | null {
  switch (value?.toLowerCase()) {
    case "orb":
    case "dynamic orb":
      return "orb";
    case "graph":
      return "graph";
    default:
      return null;
  }
}

export function parseViewIntent(text: string): FaceView | null {
  const match = VIEW_COMMAND.exec(normalize(text));
  return asFaceView(match?.[1]);
}

function graphDecision(extra: Pick<FaceModeDecision, "focusQuery" | "pathFrom" | "pathTo"> = {}): FaceModeDecision {
  return { view: "graph", exclusive: true, kind: "vault", ...extra };
}

export function decideFaceMode(text: string): FaceModeDecision {
  const clean = normalize(text);
  if (DYNAMIC_ORB_WINS.test(clean)) {
    return { view: "orb", exclusive: true, kind: "phrase" };
  }

  const explicit = parseViewIntent(clean);
  if (explicit) {
    return { view: explicit, exclusive: true, kind: "phrase" };
  }

  const path = PATH_ASK.exec(clean) ?? CONNECTED_ASK.exec(clean);
  if (path?.[1] && path[2]) {
    return graphDecision({ pathFrom: clipName(path[1]), pathTo: clipName(path[2]) });
  }

  const focus = FOCUS_NOTE.exec(clean) ?? SEARCH_GRAPH.exec(clean) ?? CONNECTIONS.exec(clean);
  if (focus?.[1]) {
    return graphDecision({ focusQuery: clipName(focus[1]) });
  }

  if (VAULT_OPEN.test(clean) || HUBS_ASK.test(clean)) {
    return graphDecision();
  }

  return { view: "graph", exclusive: false, kind: "auto" };
}

export function viewLabel(view: FaceView): string {
  switch (view) {
    case "orb":
      return "Dynamic Orb";
    case "graph":
      return "Graph";
    default: {
      const neverView: never = view;
      return neverView;
    }
  }
}
