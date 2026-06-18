# Neural Vault

An Obsidian plugin that turns a vault into a visual, searchable AI second brain.

Neural Vault combines an interactive knowledge constellation, universal AI conversation imports, local retrieval, and an optional multi-provider assistant. Imported data remains normal Markdown that you own.

## Features

- Interactive neural-style graph with zoom, pan, drag, hover, filtering, provider colors, and click-to-open nodes
- Dashboard metrics for indexed notes, links, and imported AI conversations
- Local full-vault memory search
- Source-backed **Ask your vault** workflow
- OpenAI, Claude, Gemini, and OpenRouter API support
- Configurable model IDs, so any compatible model can be selected
- ChatGPT and Claude JSON export parsing
- Generic JSON import for other AI services
- Markdown, text, and pasted-transcript import for Gemini, Copilot, Perplexity, Grok, and other assistants
- Automatic Markdown frontmatter, role headings, timestamps, tags, and related-note suggestions
- Saved AI answers with links to the local source notes
- Folder exclusions, graph limits, import folders, and answer folders
- Desktop and mobile-responsive interface

## Privacy model

The graph, imports, indexing, relevance scoring, and search run locally.

No API key is needed for those features. When you explicitly use **Ask your vault**, Neural Vault selects up to eight matching local excerpts and sends the question plus those excerpts to the provider selected in settings.

API keys are stored in the plugin's local Obsidian data file. They are not committed to this repository.

## Install for development

Requirements:

- Obsidian 1.6 or newer
- Node.js 18 or newer
- Git

Clone and build:

```bash
git clone https://github.com/Henryhhhzh/Second_Brain.git
cd Second_Brain
npm install
npm run build
```

Copy these three files into:

```text
<your-vault>/.obsidian/plugins/neural-vault/
```

Files:

```text
main.js
manifest.json
styles.css
```

Then open **Obsidian → Settings → Community plugins**, reload installed plugins, and enable **Neural Vault**.

## First use

1. Click the brain icon in Obsidian's left ribbon.
2. Select **Import AI chats**.
3. Choose export files or paste a transcript using `User:` and `Assistant:` headings.
4. Explore the generated constellation or search the imported memory.
5. Optionally add one provider API key under **Settings → Neural Vault**.
6. Open **Ask your vault**, choose the provider, and ask a question.

Imported notes default to `AI Brain/Conversations`. Saved answers default to `AI Brain/Answers`.

## Import compatibility

| Source | Best input |
| --- | --- |
| ChatGPT | `conversations.json` from a ChatGPT data export |
| Claude | Conversation JSON export or pasted transcript |
| Gemini | Pasted transcript, Markdown, text, or generic message JSON |
| Copilot | Pasted transcript, Markdown, or text |
| Perplexity | Pasted transcript, Markdown, or text |
| Grok | Pasted transcript, Markdown, or text |
| Other assistants | Generic JSON containing a `messages` array, or text with role headings |

A generic JSON conversation can use this shape:

```json
{
  "title": "Research discussion",
  "messages": [
    { "role": "user", "content": "My question" },
    { "role": "assistant", "content": "The response" }
  ]
}
```

## Commands

- **Neural Vault: Open dashboard**
- **Neural Vault: Import AI conversations**
- **Neural Vault: Rebuild local knowledge index**

## Development

```bash
npm run dev
npm run check
npm run build
```

The production build outputs `main.js` at the repository root.

## Limitations

- AI services do not all offer the same export format. Paste or generic JSON import is the fallback.
- The current local retrieval engine uses private on-device token relevance rather than an embedding model.
- Neural Vault imports conversations; it does not continuously sync private accounts or bypass provider export controls.
- API usage is billed and governed by the provider associated with your key.

## License

MIT
