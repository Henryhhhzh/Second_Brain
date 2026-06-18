import { App, TFile } from "obsidian";
import type { GraphData, GraphEdge, GraphNode, IndexedNote, SearchResult } from "./types";
import { excerptAround, tokenize } from "./utils";

export class VaultIndexer {
  private notes: IndexedNote[] = [];

  constructor(private app: App, private excludedFolders: () => string[]) {}

  async rebuild(): Promise<IndexedNote[]> {
    const excluded = this.excludedFolders();
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !excluded.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`)));

    this.notes = await Promise.all(
      files.map(async (file) => {
        const text = await this.app.vault.cachedRead(file);
        return {
          path: file.path,
          basename: file.basename,
          text,
          tokens: new Set(tokenize(`${file.basename} ${text}`)),
          modified: file.stat.mtime
        };
      })
    );
    return this.notes;
  }

  getNotes(): IndexedNote[] {
    return this.notes;
  }

  async search(query: string, limit = 8): Promise<SearchResult[]> {
    if (!this.notes.length) await this.rebuild();
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];

    return this.notes
      .map((note) => {
        const titleTokens = new Set(tokenize(note.basename));
        let score = 0;
        for (const token of queryTokens) {
          if (titleTokens.has(token)) score += 5;
          if (note.tokens.has(token)) score += 1;
        }
        const phrase = query.trim().toLowerCase();
        if (phrase.length > 3 && note.text.toLowerCase().includes(phrase)) score += 8;
        return {
          note,
          score,
          excerpt: excerptAround(note.text, queryTokens)
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.note.modified - a.note.modified)
      .slice(0, limit);
  }

  relatedNotes(text: string, excludePath = "", limit = 4): IndexedNote[] {
    const inputTokens = new Set(tokenize(text));
    if (!inputTokens.size) return [];
    return this.notes
      .filter((note) => note.path !== excludePath)
      .map((note) => {
        let intersection = 0;
        for (const token of inputTokens) {
          if (note.tokens.has(token)) intersection += 1;
        }
        const denominator = Math.sqrt(inputTokens.size * Math.max(1, note.tokens.size));
        return { note, score: intersection / denominator };
      })
      .filter((item) => item.score > 0.025)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.note);
  }

  async buildGraph(maxNodes: number): Promise<GraphData> {
    if (!this.notes.length) await this.rebuild();
    const filesByPath = new Map<string, TFile>();
    for (const file of this.app.vault.getMarkdownFiles()) filesByPath.set(file.path, file);

    const notePaths = new Set(this.notes.map((note) => note.path));
    const candidatePaths = Array.from(notePaths)
      .sort((a, b) => {
        const aFile = filesByPath.get(a);
        const bFile = filesByPath.get(b);
        return (bFile?.stat.mtime ?? 0) - (aFile?.stat.mtime ?? 0);
      })
      .slice(0, Math.max(50, maxNodes));
    const included = new Set(candidatePaths);
    const degree = new Map<string, number>();
    const edgeMap = new Map<string, GraphEdge>();

    for (const source of candidatePaths) {
      const links = this.app.metadataCache.resolvedLinks[source] ?? {};
      for (const [target, weight] of Object.entries(links)) {
        if (!included.has(target) || source === target) continue;
        const sorted = [source, target].sort();
        const key = `${sorted[0]}→${sorted[1]}`;
        const existing = edgeMap.get(key);
        if (existing) existing.weight += weight;
        else edgeMap.set(key, { source: sorted[0], target: sorted[1], weight });
        degree.set(source, (degree.get(source) ?? 0) + weight);
        degree.set(target, (degree.get(target) ?? 0) + weight);
      }
    }

    const nodes: GraphNode[] = candidatePaths.map((path, index) => {
      const file = filesByPath.get(path);
      const cache = file ? this.app.metadataCache.getFileCache(file) : null;
      const frontmatter = cache?.frontmatter ?? {};
      const tags = [
        ...(cache?.tags?.map((tag) => tag.tag.replace(/^#/, "")) ?? []),
        ...(Array.isArray(frontmatter.tags) ? frontmatter.tags : [])
      ].map(String);
      const provider = String(frontmatter.ai_provider ?? frontmatter.provider ?? "note").toLowerCase();
      const angle = index * 2.399963;
      const spiral = 36 * Math.sqrt(index + 1);
      const nodeDegree = degree.get(path) ?? 0;
      return {
        id: path,
        path,
        label: file?.basename ?? path,
        provider,
        tags: Array.from(new Set(tags)),
        x: Math.cos(angle) * spiral,
        y: Math.sin(angle) * spiral,
        vx: 0,
        vy: 0,
        radius: Math.min(14, 5 + Math.sqrt(nodeDegree) * 1.3),
        degree: nodeDegree,
        fixed: false
      };
    });

    return { nodes, edges: Array.from(edgeMap.values()) };
  }
}
