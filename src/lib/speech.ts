type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => Recognition;

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

export async function speakText(text: string, onEnd: () => void): Promise<void> {
  stopSpeaking();
  try {
    const response = await fetch("/api/jarvis/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      const finish = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        URL.revokeObjectURL(url);
        onEnd();
      };
      audio.onended = finish;
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        speakWithBrowser(text, onEnd);
      };
      await audio.play();
      return;
    }
  } catch {
    speakWithBrowser(text, onEnd);
    return;
  }
  speakWithBrowser(text, onEnd);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    if (currentUtterance) {
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
      currentUtterance = null;
    }
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowser(text: string, onEnd: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    window.setTimeout(onEnd, 700);
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  utterance.rate = 0.96;
  utterance.pitch = 0.92;
  const british = synth.getVoices().find((voice) => /en-GB/i.test(voice.lang));
  if (british) {
    utterance.voice = british;
  }
  utterance.onend = () => onEnd();
  utterance.onerror = () => onEnd();
  synth.speak(utterance);
}

export function createEar(handlers: {
  onPhrase: (text: string) => void;
  onError: () => void;
  shouldAccept: (text: string) => boolean;
}): { stop: () => void } | null {
  const speechWindow = window as SpeechWindow;
  const Ctor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Ctor) {
    return null;
  }
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  let stopped = false;

  recognition.onresult = (event) => {
    let said = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.isFinal) {
        said += ` ${result[0].transcript}`;
      }
    }
    const text = said.trim();
    if (!text) {
      return;
    }
    if (!handlers.shouldAccept(text.toLowerCase())) {
      return;
    }
    handlers.onPhrase(text);
  };
  recognition.onerror = () => {
    handlers.onError();
  };
  recognition.onend = () => {
    if (stopped) {
      return;
    }
    try {
      recognition.start();
    } catch {
      handlers.onError();
    }
  };
  try {
    recognition.start();
  } catch {
    handlers.onError();
    return null;
  }
  return {
    stop: () => {
      stopped = true;
      recognition.onend = null;
      recognition.stop();
    },
  };
}
