import { Modal, Notice, Setting } from "obsidian";
import { parseConversationJson, parseTranscript } from "./importers";
import type { ImportedConversation } from "./types";

const PROVIDER_OPTIONS: Record<string, string> = {
  auto: "Auto-detect",
  chatgpt: "ChatGPT / OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  copilot: "Microsoft Copilot",
  perplexity: "Perplexity",
  grok: "Grok",
  other: "Other AI"
};

export class ImportConversationModal extends Modal {
  private provider = "auto";
  private title = "";
  private transcript = "";
  private selectedFiles: File[] = [];
  private statusEl!: HTMLElement;
  private importButton!: HTMLButtonElement;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private onImport: (conversations: ImportedConversation[]) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("neural-import-modal");
    contentEl.createEl("h2", { text: "Import AI conversations" });
    contentEl.createEl("p", {
      text: "Paste any transcript, or select ChatGPT/Claude/generic JSON, Markdown, or text exports. Nothing is sent to an AI provider."
    });

    new Setting(contentEl).setName("Source").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(PROVIDER_OPTIONS)) dropdown.addOption(value, label);
      dropdown.setValue(this.provider).onChange((value) => {
        this.provider = value;
        this.refreshStatus();
      });
    });

    new Setting(contentEl)
      .setName("Title")
      .setDesc("Used for a pasted transcript. File imports use their own titles.")
      .addText((text) =>
        text.setPlaceholder("Conversation title").onChange((value) => {
          this.title = value;
        })
      );

    const fileSetting = new Setting(contentEl)
      .setName("Export files")
      .setDesc("Select one or more .json, .md, or .txt files.");
    const fileInput = fileSetting.controlEl.createEl("input", {
      attr: { type: "file", multiple: "true", accept: ".json,.md,.markdown,.txt,application/json,text/plain,text/markdown" }
    });
    fileInput.addEventListener("change", () => {
      this.selectedFiles = Array.from(fileInput.files ?? []);
      this.refreshStatus();
    });

    const transcriptLabel = contentEl.createEl("label", {
      cls: "neural-field-label",
      text: "Paste transcript"
    });
    transcriptLabel.htmlFor = "neural-import-transcript";
    const textarea = contentEl.createEl("textarea", {
      cls: "neural-import-textarea",
      attr: {
        id: "neural-import-transcript",
        placeholder: "User: ...\nAssistant: ...",
        rows: "12"
      }
    });
    textarea.addEventListener("input", () => {
      this.transcript = textarea.value;
      this.refreshStatus();
    });

    this.statusEl = contentEl.createDiv({ cls: "neural-import-status" });
    const actions = contentEl.createDiv({ cls: "neural-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    this.importButton = actions.createEl("button", {
      cls: "mod-cta",
      text: "Import"
    });
    this.importButton.addEventListener("click", () => void this.runImport());
    this.refreshStatus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private refreshStatus(): void {
    if (!this.statusEl || !this.importButton) return;
    const hasTranscript = Boolean(this.transcript.trim());
    const count = this.selectedFiles.length;
    this.statusEl.setText(
      count
        ? `${count} file${count === 1 ? "" : "s"} selected${hasTranscript ? " plus pasted transcript" : ""}.`
        : hasTranscript
          ? "Pasted transcript ready."
          : "Choose files or paste a transcript."
    );
    this.importButton.disabled = !count && !hasTranscript;
  }

  private async runImport(): Promise<void> {
    this.importButton.disabled = true;
    this.importButton.setText("Reading…");
    try {
      const conversations: ImportedConversation[] = [];
      const provider = this.provider === "auto" ? "ai" : this.provider;

      for (const file of this.selectedFiles) {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text) as unknown;
          conversations.push(...parseConversationJson(parsed, provider));
        } else {
          conversations.push(parseTranscript(text, provider, file.name.replace(/\.[^.]+$/, "")));
        }
      }

      if (this.transcript.trim()) {
        conversations.push(
          parseTranscript(
            this.transcript,
            provider,
            this.title.trim() || `${PROVIDER_OPTIONS[this.provider] ?? "AI"} conversation`
          )
        );
      }

      if (!conversations.length) {
        throw new Error("No recognizable conversations were found in the selected input.");
      }

      this.importButton.setText(`Importing ${conversations.length}…`);
      await this.onImport(conversations);
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Import failed: ${message}`, 7000);
      this.importButton.disabled = false;
      this.importButton.setText("Import");
    }
  }
}
