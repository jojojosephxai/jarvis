import { Face } from "@/components/face";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Face realtimeAllowed={process.env.JARVIS_VOICE_LAYER === "realtime"} />;
}
