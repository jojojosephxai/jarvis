export const DEFAULT_AZURE_VOICE = "en-GB-SoniaNeural";

export const SPEAK_LIMIT = 600;

export type ServerSpeakFailure = {
  live: false;
  reason: "unconfigured" | "rejected" | "failed";
  detail: string;
};

export type VoiceProvider = "azure" | "none";

export type VoicePublicStatus = {
  provider: VoiceProvider;
  live: boolean;
  voice: string | null;
  detail: string;
};

export type MouthKind = "azure" | "browser" | "not-live";

export type EarsKind = "browser" | "unsupported";

export type VoiceCandidate = {
  name: string;
  lang: string;
};

export type SpeakOutcome = {
  played: boolean;
  mouth: MouthKind;
  notice: string | null;
};
