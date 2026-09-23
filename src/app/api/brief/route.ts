import { loadMorningBrief } from "@/lib/morning-brief";

export async function GET() {
  try {
    const brief = await loadMorningBrief();
    return Response.json(brief);
  } catch {
    return Response.json({ error: "The morning brief did not load." }, { status: 500 });
  }
}
