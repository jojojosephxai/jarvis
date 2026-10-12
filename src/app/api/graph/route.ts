import { loadVaultGraph } from "@/lib/note-graph.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const graph = await loadVaultGraph();
  return Response.json(graph);
}
