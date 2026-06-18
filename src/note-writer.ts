import { App, normalizePath, TFile } from "obsidian";
import type { ImportedConversation, IndexedNote } from "./types";
import { ensureFolder, escapeMarkdown, formatDate, uniqueMarkdownPath, yamlString } from "./utils";

export interface ImportWriteResult {
  files: TFile[];
  messageCount: number;
}

function conversationMarkdown(conversation: ImportedConversation, related: IndexedNote[]): string {
  const importedAt = new Date().toISOString();
  const createdAt = formatDate(conversation.createdAt);
  const frontmatter = [
    "---",
    "type: ai-conversation",
    `ai_provider: ${yamlString(conversation.provider)}`,
    `source_created: ${yamlString(createdAt)}`,
    `imported_at: ${yamlString(importedAt)}`,
    "tags:",
    "  - ai-conversation",
    `  - ai-${conversation.provider.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    "---"
  ].join("\n");

  const messages = conversation.messages
    .map((message) => {
      const label =
        message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "You";
      const timestamp = message.createdAt ? ` · ${formatDate(message.createdAt)}` : "";
      return `## ${label}${timestamp}\n\n${escapeMarkdown(message.text)}`;
    })
    .join("\n\n");

  const relatedSection = related.length
    ? `\n\n## Related notes\n\n${related.map((note) => `- [[${note.basename}]]`).join("\n")}`
    : "";

  return `${frontmatter}\n\n# ${conversation.title}\n\n> Imported from ${conversation.provider} into Neural Vault.\n\n${messages}${relatedSection}\n`;
}

export async function writeConversations(
  app: App,
  conversations: ImportedConversation[],
  folder: string,
  findRelated: (text: string, limit: number) => IndexedNote[],
  relatedLimit: number
): Promise<ImportWriteResult> {
  const normalizedFolder = normalizePath(folder);
  await ensureFolder(app.vault, normalizedFolder);
  const files: TFile[] = [];
  let messageCount = 0;

  for (const conversation of conversations) {
    const combinedText = conversation.messages.map((message) => message.text).join("\n");
    const related = relatedLimit > 0 ? findRelated(`${conversation.title}\n${combinedText}`, relatedLimit) : [];
    const path = uniqueMarkdownPath(app.vault, normalizedFolder, conversation.title);
    const file = await app.vault.create(path, conversationMarkdown(conversation, related));
    files.push(file);
    messageCount += conversation.messages.length;
  }

  return { files, messageCount };
}

export async function writeAnswer(
  app: App,
  folder: string,
  question: string,
  answer: string,
  provider: string,
  sourcePaths: string[]
): Promise<TFile> {
  const normalizedFolder = normalizePath(folder);
  await ensureFolder(app.vault, normalizedFolder);
  const title = `Answer - ${question}`;
  const path = uniqueMarkdownPath(app.vault, normalizedFolder, title);
  const sourceLinks = sourcePaths
    .map((sourcePath) => {
      const file = app.vault.getAbstractFileByPath(sourcePath);
      return file instanceof TFile ? `- [[${file.basename}]]` : `- ${sourcePath}`;
    })
    .join("\n");
  const markdown = `---
type: neural-vault-answer
ai_provider: ${yamlString(provider)}
created_at: ${yamlString(new Date().toISOString())}
tags:
  - ai-answer
---

# ${question}

${answer.trim()}

## Source notes

${sourceLinks || "- No matching local notes"}
`;
  return app.vault.create(path, markdown);
}
