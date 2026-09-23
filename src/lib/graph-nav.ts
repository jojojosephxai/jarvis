export type NavNode = {
  id: string;
  title: string;
  folder: string;
  tags?: string[];
};

export type NavEdge = {
  from: string;
  to: string;
};

export function degreeOf(id: string, edges: NavEdge[]): number {
  let degree = 0;
  for (const edge of edges) {
    if (edge.from === id || edge.to === id) degree += 1;
  }
  return degree;
}

export function topHubs<T extends { id: string }>(
  nodes: T[],
  edges: NavEdge[],
  limit: number,
): { node: T; degree: number }[] {
  const ranked = nodes
    .map((node) => ({ node, degree: degreeOf(node.id, edges) }))
    .filter((entry) => entry.degree > 0)
    .sort((a, b) => {
      if (b.degree !== a.degree) return b.degree - a.degree;
      if (a.node.id < b.node.id) return -1;
      if (a.node.id > b.node.id) return 1;
      return 0;
    });
  return ranked.slice(0, Math.max(0, limit));
}

export function shortestPath(edges: NavEdge[], start: string, goal: string): string[] | null {
  if (start === goal) return [start];
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const fromList = next.get(edge.from) ?? [];
    fromList.push(edge.to);
    next.set(edge.from, fromList);
    const toList = next.get(edge.to) ?? [];
    toList.push(edge.from);
    next.set(edge.to, toList);
  }
  const previous = new Map<string, string>();
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const neighbors = next.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      previous.set(neighbor, current);
      if (neighbor === goal) {
        const path = [goal];
        let cursor = goal;
        while (cursor !== start) {
          const before = previous.get(cursor);
          if (!before) return null;
          path.push(before);
          cursor = before;
        }
        path.reverse();
        return path;
      }
      queue.push(neighbor);
    }
  }
  return null;
}

function cleaned(query: string): string {
  return query.trim().toLowerCase();
}

export function matchingNodes<T extends NavNode>(nodes: T[], query: string): T[] {
  const q = cleaned(query);
  if (!q) return [];
  return nodes.filter((node) => {
    if (node.title.toLowerCase().includes(q)) return true;
    if (node.id.toLowerCase().includes(q)) return true;
    if (node.folder.toLowerCase().includes(q)) return true;
    return node.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
  });
}

export function matchGraphNode<T extends NavNode>(nodes: T[], query: string): T | null {
  const q = cleaned(query);
  if (!q) return null;
  const exactTitle = nodes.find((node) => node.title.toLowerCase() === q);
  if (exactTitle) return exactTitle;
  const exactId = nodes.find((node) => {
    const id = node.id.toLowerCase();
    return id === q || id === `${q}.md`;
  });
  if (exactId) return exactId;
  const titleHits = nodes.filter((node) => node.title.toLowerCase().includes(q));
  if (titleHits.length === 1) return titleHits[0] ?? null;
  if (titleHits.length > 1) {
    return [...titleHits].sort((a, b) => a.title.length - b.title.length || a.id.localeCompare(b.id))[0] ?? null;
  }
  return (
    nodes.find((node) => node.id.toLowerCase().includes(q) || node.folder.toLowerCase() === q) ?? null
  );
}
