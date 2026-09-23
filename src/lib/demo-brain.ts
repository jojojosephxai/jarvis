import { mentionsCalendar } from "./intent";

export const CALL_REFUSAL =
  "I don't place phone calls. I can put a reminder on the demo calendar instead. Try: Put call Mom on my calendar tomorrow at 4pm.";

export function demoChatReply(text: string): string {
  const q = text.toLowerCase();

  if (/\b(who are you|what are you|your name)\b/.test(q)) {
    return "I'm Jarvis. The light is the face, this conversation is the brain, and when I do a task the hands leave a receipt.";
  }

  if (/\b(help|what can you do|how do i use)\b/.test(q)) {
    return "Ask me to put an event on your calendar, check that calendar, save a note, or search notes. Each task leaves a receipt. With an xAI key, I can also talk more freely.";
  }

  if (mentionsCalendar(text)) {
    return "Tell me the event and when it happens. Try: Put soccer practice on my calendar tomorrow at 4pm.";
  }

  if (/\b(homework|science|school|practice)\b/.test(q)) {
    return "I can save that as a note or put it on the demo calendar. Try: Remember that the science worksheet is due Thursday.";
  }

  return "I can answer more freely once a Grok key is set. Without one, I can still put events on the demo calendar, list them, save notes, and search notes.";
}
