import { readVaultMarkdown, resolveVaultPath } from "@/lib/vault-read";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const notePath = new URL(request.url).searchParams.get("path") ?? "";
  const note = await readVaultMarkdown(resolveVaultPath(process.cwd()), notePath);
  if (!note) {
    return Response.json({ error: "That note is not in the vault." }, { status: 404 });
  }
  return Response.json({ path: note.path, markdown: note.markdown });
}
