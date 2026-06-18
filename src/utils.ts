import { normalizePath, type Vault } from "obsidian";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "between", "both", "but", "can", "could", "did", "does", "doing",
  "each", "for", "from", "had", "has", "have", "here", "how", "into", "its",
  "just", "more", "most", "not", "now", "only", "other", "our", "out", "over",
  "same", "should", "some", "such", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "through", "too", "under", "very",
  "was", "were", "what", "when", "where", "which", "while", "who", "why",
  "will", "with", "would", "you", "your"
]);

export function tokenize(input: string): string[] {
  const words = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return Array.from(new Set(words));
}

export function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|#[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "Untitled AI conversation";
}

export function yamlString(input: string): string {
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function ensureFolder(vault: Vault, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (!normalized || vault.getAbstractFileByPath(normalized)) return;
  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!vault.getAbstractFileByPath(current)) {
      await vault.createFolder(current);
    }
  }
}

export function uniqueMarkdownPath(vault: Vault, folder: string, title: string): string {
  const base = normalizePath(`${folder}/${sanitizeFileName(title)}`);
  let path = `${base}.md`;
  let index = 2;
  while (vault.getAbstractFileByPath(path)) {
    path = `${base} ${index}.md`;
    index += 1;
  }
  return path;
}

export function formatDate(value?: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function excerptAround(text: string, queryTokens: string[], length = 420): string {
  const lower = text.toLowerCase();
  let start = 0;
  for (const token of queryTokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index >= 0) {
      start = Math.max(0, index - 100);
      break;
    }
  }
  return text.slice(start, start + length).replace(/\s+/g, " ").trim();
}

export function escapeMarkdown(input: string): string {
  return input.replace(/\r\n/g, "\n").trim();
}
