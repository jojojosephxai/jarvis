export const REACTOR_MODELS = ["grok-4", "grok-3", "grok-2"] as const;

export type ReactorModel = (typeof REACTOR_MODELS)[number];

export function isReactorModel(value: string): value is ReactorModel {
  switch (value) {
    case "grok-4":
    case "grok-3":
    case "grok-2":
      return true;
    default:
      return false;
  }
}

export function reactorCore(model: ReactorModel): string {
  switch (model) {
    case "grok-4":
      return "#3ee0ff";
    case "grok-3":
      return "#e6c15a";
    case "grok-2":
      return "#c084fc";
    default: {
      const exhaustive: never = model;
      return exhaustive;
    }
  }
}

export function reactorLabel(model: ReactorModel): string {
  return `running on ${model}`;
}
