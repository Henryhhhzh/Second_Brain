import type { NeuralVaultSettings } from "./types";

export const DEFAULT_SETTINGS: NeuralVaultSettings = {
  importFolder: "AI Brain/Conversations",
  answerFolder: "AI Brain/Answers",
  excludedFolders: ".obsidian, Templates",
  maxGraphNodes: 600,
  relatedLinks: 4,
  activeProvider: "openai",
  providers: {
    openai: {
      apiKey: "",
      model: "gpt-5.4-mini"
    },
    anthropic: {
      apiKey: "",
      model: "claude-sonnet-4-6"
    },
    gemini: {
      apiKey: "",
      model: "gemini-3.5-flash"
    },
    openrouter: {
      apiKey: "",
      model: "openai/gpt-5.4-mini"
    }
  }
};
