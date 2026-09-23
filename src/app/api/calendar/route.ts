import { listCalendarEvents } from "@/lib/calendar-store";

export async function GET() {
  const events = await listCalendarEvents();
  return Response.json({ events });
}
