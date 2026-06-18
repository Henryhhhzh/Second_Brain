export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter";

export interface ProviderSettings {
  apiKey: string;
  model: string;
}

export interface NeuralVaultSettings {
  importFolder: string;
  answerFolder: string;
  excludedFolders: string;
  maxGraphNodes: number;
  relatedLinks: number;
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  text: string;
  createdAt?: string;
}

export interface ImportedConversation {
  title: string;
  provider: string;
  createdAt?: string;
  messages: ConversationMessage[];
  rawText?: string;
}

export interface IndexedNote {
  path: string;
  basename: string;
  text: string;
  tokens: Set<string>;
  modified: number;
}

export interface SearchResult {
  note: IndexedNote;
  score: number;
  excerpt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  provider: string;
  tags: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  degree: number;
  fixed: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
