import { requestUrl } from "obsidian";
import type { ProviderId, ProviderSettings, SearchResult } from "./types";

const SYSTEM_PROMPT = `You are the assistant inside an Obsidian knowledge vault.
Answer only from the supplied vault context when the question concerns the user's notes.
State uncertainty clearly. Cite supporting notes using [[Note Name]] wiki links.
Do not claim that a note says something unless the supplied excerpt supports it.
Keep the answer useful, structured, and concise.`;

function contextPrompt(question: string, results: SearchResult[]): string {
  const context = results
    .map((result, index) => `SOURCE ${index + 1}: [[${result.note.basename}]]\nPath: ${result.note.path}\n${result.excerpt}`)
    .join("\n\n---\n\n");
  return `VAULT CONTEXT:\n${context || "(No matching notes found.)"}\n\nUSER QUESTION:\n${question}`;
}

function openAiText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return "";
  return record.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return String((part as Record<string, unknown>).text ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

export async function askProvider(
  provider: ProviderId,
  settings: ProviderSettings,
  question: string,
  results: SearchResult[]
): Promise<string> {
  if (!settings.apiKey.trim()) throw new Error(`Add a ${provider} API key in Neural Vault settings first.`);
  if (!settings.model.trim()) throw new Error(`Set a model for ${provider} in Neural Vault settings.`);
  const prompt = contextPrompt(question, results);

  if (provider === "openai") {
    const response = await requestUrl({
      url: "https://api.openai.com/v1/responses",
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model.trim(),
        instructions: SYSTEM_PROMPT,
        input: prompt
      }),
      throw: false
    });
    if (response.status >= 400) throw new Error(response.json?.error?.message ?? `OpenAI request failed (${response.status}).`);
    return openAiText(response.json) || "The provider returned no text.";
  }

  if (provider === "anthropic") {
    const response = await requestUrl({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": settings.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model.trim(),
        max_tokens: 1600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }]
      }),
      throw: false
    });
    if (response.status >= 400) throw new Error(response.json?.error?.message ?? `Claude request failed (${response.status}).`);
    const blocks = Array.isArray(response.json?.content) ? response.json.content : [];
    return blocks.map((block: { text?: string }) => block.text ?? "").filter(Boolean).join("\n") || "The provider returned no text.";
  }

  if (provider === "gemini") {
    const model = encodeURIComponent(settings.model.trim());
    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      method: "POST",
      headers: {
        "x-goog-api-key": settings.apiKey.trim(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      }),
      throw: false
    });
    if (response.status >= 400) throw new Error(response.json?.error?.message ?? `Gemini request failed (${response.status}).`);
    const parts = response.json?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part: { text?: string }) => part.text ?? "").filter(Boolean).join("\n") || "The provider returned no text.";
  }

  const response = await requestUrl({
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      "Content-Type": "application/json",
      "X-Title": "Neural Vault for Obsidian"
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]
    }),
    throw: false
  });
  if (response.status >= 400) throw new Error(response.json?.error?.message ?? `OpenRouter request failed (${response.status}).`);
  return response.json?.choices?.[0]?.message?.content ?? "The provider returned no text.";
}
