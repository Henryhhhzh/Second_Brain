import type { ConversationMessage, ImportedConversation } from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function roleFrom(value: unknown): ConversationMessage["role"] {
  const role = asString(value).toLowerCase();
  if (role === "assistant" || role === "model" || role === "ai") return "assistant";
  if (role === "system") return "system";
  return "user";
}

function extractChatGptConversation(item: UnknownRecord): ImportedConversation | null {
  if (!isRecord(item.mapping)) return null;
  const messages: ConversationMessage[] = [];
  const mapped = Object.values(item.mapping);
  mapped
    .map((node) => (isRecord(node) && isRecord(node.message) ? node.message : null))
    .filter((message): message is UnknownRecord => Boolean(message))
    .sort((a, b) => Number(a.create_time ?? 0) - Number(b.create_time ?? 0))
    .forEach((message) => {
      const author = isRecord(message.author) ? message.author.role : "user";
      const content = isRecord(message.content) ? message.content : {};
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const text = parts
        .map((part) => (typeof part === "string" ? part : isRecord(part) ? asString(part.text) : ""))
        .filter(Boolean)
        .join("\n");
      if (text.trim()) {
        messages.push({
          role: roleFrom(author),
          text: text.trim(),
          createdAt: message.create_time ? new Date(Number(message.create_time) * 1000).toISOString() : undefined
        });
      }
    });
  if (!messages.length) return null;
  return {
    title: asString(item.title) || "ChatGPT conversation",
    provider: "chatgpt",
    createdAt: item.create_time ? new Date(Number(item.create_time) * 1000).toISOString() : undefined,
    messages
  };
}

function extractClaudeConversation(item: UnknownRecord): ImportedConversation | null {
  const rawMessages = Array.isArray(item.chat_messages)
    ? item.chat_messages
    : Array.isArray(item.messages)
      ? item.messages
      : null;
  if (!rawMessages) return null;
  const messages = rawMessages
    .filter(isRecord)
    .map((message) => {
      const content = message.text ?? message.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        text = content
          .map((block) => (isRecord(block) ? asString(block.text) : asString(block)))
          .filter(Boolean)
          .join("\n");
      }
      return {
        role: roleFrom(message.sender ?? message.role),
        text: text.trim(),
        createdAt: asString(message.created_at ?? message.createdAt) || undefined
      } satisfies ConversationMessage;
    })
    .filter((message) => message.text);
  if (!messages.length) return null;
  return {
    title: asString(item.name ?? item.title) || "Claude conversation",
    provider: "claude",
    createdAt: asString(item.created_at ?? item.createdAt) || undefined,
    messages
  };
}

function extractGenericConversation(item: UnknownRecord, provider: string): ImportedConversation | null {
  if (!Array.isArray(item.messages)) return null;
  const messages = item.messages
    .filter(isRecord)
    .map((message) => {
      const content = message.content ?? message.text ?? message.parts;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        text = content
          .map((part) => (typeof part === "string" ? part : isRecord(part) ? asString(part.text) : ""))
          .filter(Boolean)
          .join("\n");
      }
      return {
        role: roleFrom(message.role ?? message.author),
        text: text.trim(),
        createdAt: asString(message.createdAt ?? message.created_at) || undefined
      } satisfies ConversationMessage;
    })
    .filter((message) => message.text);
  if (!messages.length) return null;
  return {
    title: asString(item.title ?? item.name) || `${provider} conversation`,
    provider,
    createdAt: asString(item.createdAt ?? item.created_at) || undefined,
    messages
  };
}

export function parseConversationJson(value: unknown, providerHint: string): ImportedConversation[] {
  const items = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.conversations) ? value.conversations : [value];
  const conversations: ImportedConversation[] = [];

  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const chatGpt = extractChatGptConversation(raw);
    if (chatGpt) {
      conversations.push(chatGpt);
      continue;
    }
    const claude = extractClaudeConversation(raw);
    if (claude) {
      conversations.push(claude);
      continue;
    }
    const generic = extractGenericConversation(raw, providerHint);
    if (generic) conversations.push(generic);
  }
  return conversations;
}

export function parseTranscript(text: string, provider: string, title: string): ImportedConversation {
  const rolePattern = /^(user|human|you|assistant|ai|chatgpt|claude|gemini|system)\s*:\s*/i;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages: ConversationMessage[] = [];
  let current: ConversationMessage | null = null;

  for (const line of lines) {
    const match = line.match(rolePattern);
    if (match) {
      if (current?.text.trim()) messages.push({ ...current, text: current.text.trim() });
      current = {
        role: roleFrom(match[1]),
        text: line.slice(match[0].length)
      };
    } else if (current) {
      current.text += `${current.text ? "\n" : ""}${line}`;
    }
  }
  if (current?.text.trim()) messages.push({ ...current, text: current.text.trim() });

  if (!messages.length) {
    messages.push({ role: "user", text: text.trim() });
  }
  return { title, provider, messages, rawText: text };
}
