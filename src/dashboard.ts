import {
  ItemView,
  MarkdownRenderer,
  Notice,
  Setting,
  WorkspaceLeaf,
  setIcon
} from "obsidian";
import { NeuralGraphRenderer } from "./graph-renderer";
import type { VaultIndexer } from "./indexer";
import { writeAnswer } from "./note-writer";
import { askProvider } from "./providers";
import type { NeuralVaultSettings, ProviderId, SearchResult } from "./types";

export const NEURAL_VAULT_VIEW = "neural-vault-dashboard";

export interface DashboardHost {
  settings: NeuralVaultSettings;
  indexer: VaultIndexer;
  openImporter(): void;
  rebuildIndex(): Promise<void>;
}

type DashboardTab = "graph" | "search" | "ask";

const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  openrouter: "OpenRouter"
};

export class NeuralVaultView extends ItemView {
  private graph: NeuralGraphRenderer | null = null;
  private bodyEl!: HTMLElement;
  private navButtons = new Map<DashboardTab, HTMLButtonElement>();
  private activeTab: DashboardTab = "graph";

  constructor(leaf: WorkspaceLeaf, private host: DashboardHost) {
    super(leaf);
  }

  getViewType(): string {
    return NEURAL_VAULT_VIEW;
  }

  getDisplayText(): string {
    return "Neural Vault";
  }

  getIcon(): string {
    return "brain-circuit";
  }

  async onOpen(): Promise<void> {
    await this.renderShell();
  }

  async onClose(): Promise<void> {
    this.graph?.destroy();
    this.graph = null;
  }

  async refresh(): Promise<void> {
    await this.host.rebuildIndex();
    await this.renderShell();
  }

  private async renderShell(): Promise<void> {
    this.graph?.destroy();
    this.graph = null;
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("neural-vault-view");

    const header = root.createDiv({ cls: "neural-header" });
    const identity = header.createDiv({ cls: "neural-identity" });
    const mark = identity.createDiv({ cls: "neural-brand-mark" });
    setIcon(mark, "brain-circuit");
    const titleWrap = identity.createDiv();
    titleWrap.createEl("h1", { text: "Neural Vault" });
    titleWrap.createDiv({ cls: "neural-subtitle", text: "Your connected intelligence layer" });

    const headerActions = header.createDiv({ cls: "neural-header-actions" });
    const importButton = headerActions.createEl("button", { cls: "mod-cta", text: "Import AI chats" });
    setIcon(importButton.createSpan({ cls: "neural-button-icon" }), "download");
    importButton.addEventListener("click", () => this.host.openImporter());
    const refreshButton = headerActions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Rebuild vault index" }
    });
    setIcon(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => void this.refresh());

    const notes = this.host.indexer.getNotes();
    const chatCount = notes.filter((note) => note.text.includes("type: ai-conversation")).length;
    const linkCount = Object.values(this.app.metadataCache.resolvedLinks).reduce(
      (total, links) => total + Object.keys(links).length,
      0
    );
    const stats = root.createDiv({ cls: "neural-stats" });
    this.createStat(stats, "files", String(notes.length), "Indexed notes");
    this.createStat(stats, "network", String(linkCount), "Knowledge links");
    this.createStat(stats, "messages-square", String(chatCount), "AI conversations");

    const workspace = root.createDiv({ cls: "neural-workspace" });
    const nav = workspace.createDiv({ cls: "neural-nav" });
    this.createNavButton(nav, "graph", "share-2", "Neural graph");
    this.createNavButton(nav, "search", "search", "Search memory");
    this.createNavButton(nav, "ask", "sparkles", "Ask your vault");

    this.bodyEl = workspace.createDiv({ cls: "neural-body" });
    await this.showTab(this.activeTab);
  }

  private createStat(parent: HTMLElement, icon: string, value: string, label: string): void {
    const card = parent.createDiv({ cls: "neural-stat-card" });
    const iconEl = card.createDiv({ cls: "neural-stat-icon" });
    setIcon(iconEl, icon);
    const text = card.createDiv();
    text.createDiv({ cls: "neural-stat-value", text: value });
    text.createDiv({ cls: "neural-stat-label", text: label });
  }

  private createNavButton(parent: HTMLElement, tab: DashboardTab, icon: string, label: string): void {
    const button = parent.createEl("button", { cls: "neural-nav-button" });
    const iconEl = button.createSpan();
    setIcon(iconEl, icon);
    button.createSpan({ text: label });
    button.toggleClass("is-active", this.activeTab === tab);
    button.addEventListener("click", () => void this.showTab(tab));
    this.navButtons.set(tab, button);
  }

  private async showTab(tab: DashboardTab): Promise<void> {
    this.activeTab = tab;
    for (const [key, button] of this.navButtons) button.toggleClass("is-active", key === tab);
    this.graph?.destroy();
    this.graph = null;
    this.bodyEl.empty();
    if (tab === "graph") await this.renderGraph();
    else if (tab === "search") this.renderSearch();
    else this.renderAsk();
  }

  private async renderGraph(): Promise<void> {
    const toolbar = this.bodyEl.createDiv({ cls: "neural-panel-toolbar" });
    const intro = toolbar.createDiv();
    intro.createEl("h2", { text: "Knowledge constellation" });
    intro.createDiv({ cls: "neural-panel-description", text: "Drag nodes, scroll to zoom, click to open." });
    const controls = toolbar.createDiv({ cls: "neural-graph-controls" });
    const filter = controls.createEl("input", {
      cls: "neural-input",
      attr: { type: "search", placeholder: "Filter notes, tags, or AI…" }
    });
    const resetButton = controls.createEl("button", { text: "Reset view" });

    const graphHost = this.bodyEl.createDiv({ cls: "neural-graph-panel" });
    graphHost.createDiv({ cls: "neural-graph-loading", text: "Mapping your vault…" });
    const data = await this.host.indexer.buildGraph(this.host.settings.maxGraphNodes);
    graphHost.empty();
    if (!data.nodes.length) {
      const empty = graphHost.createDiv({ cls: "neural-empty-state" });
      setIcon(empty.createDiv(), "orbit");
      empty.createEl("h3", { text: "Your constellation is waiting" });
      empty.createEl("p", { text: "Create or import notes, then rebuild the index." });
      const importButton = empty.createEl("button", { cls: "mod-cta", text: "Import AI conversations" });
      importButton.addEventListener("click", () => this.host.openImporter());
      return;
    }

    this.graph = new NeuralGraphRenderer(this.app, graphHost);
    this.graph.setData(data);
    filter.addEventListener("input", () => this.graph?.setQuery(filter.value));
    resetButton.addEventListener("click", () => this.graph?.resetView());

    const legend = graphHost.createDiv({ cls: "neural-legend" });
    for (const [label, cls] of [
      ["Notes", "note"],
      ["ChatGPT", "openai"],
      ["Claude", "claude"],
      ["Gemini", "gemini"]
    ]) {
      const item = legend.createDiv({ cls: "neural-legend-item" });
      item.createSpan({ cls: `neural-legend-dot is-${cls}` });
      item.createSpan({ text: label });
    }
  }

  private renderSearch(): void {
    const panel = this.bodyEl.createDiv({ cls: "neural-content-panel" });
    panel.createEl("h2", { text: "Search your memory" });
    panel.createEl("p", {
      cls: "neural-panel-description",
      text: "Local full-vault search. Your notes never leave this device."
    });
    const input = panel.createEl("input", {
      cls: "neural-hero-input",
      attr: { type: "search", placeholder: "What are you trying to remember?" }
    });
    const resultsEl = panel.createDiv({ cls: "neural-search-results" });
    let timer = 0;
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void this.runSearch(input.value, resultsEl), 180);
    });
    input.focus();
    this.renderSearchHint(resultsEl);
  }

  private renderSearchHint(parent: HTMLElement): void {
    parent.empty();
    const hint = parent.createDiv({ cls: "neural-empty-state is-compact" });
    setIcon(hint.createDiv(), "scan-search");
    hint.createEl("h3", { text: "Search by idea, not location" });
    hint.createEl("p", { text: "Try a project, person, decision, concept, or phrase." });
  }

  private async runSearch(query: string, parent: HTMLElement): Promise<void> {
    if (!query.trim()) {
      this.renderSearchHint(parent);
      return;
    }
    const results = await this.host.indexer.search(query, 20);
    parent.empty();
    parent.createDiv({
      cls: "neural-result-count",
      text: `${results.length} matching note${results.length === 1 ? "" : "s"}`
    });
    if (!results.length) {
      parent.createDiv({ cls: "neural-no-results", text: "No local matches found." });
      return;
    }
    for (const result of results) {
      const card = parent.createEl("button", { cls: "neural-result-card" });
      const heading = card.createDiv({ cls: "neural-result-heading" });
      heading.createSpan({ cls: "neural-result-title", text: result.note.basename });
      heading.createSpan({ cls: "neural-score", text: `Match ${result.score}` });
      card.createDiv({ cls: "neural-result-path", text: result.note.path });
      card.createDiv({ cls: "neural-result-excerpt", text: result.excerpt });
      card.addEventListener("click", () => void this.app.workspace.openLinkText(result.note.path, "", false));
    }
  }

  private renderAsk(): void {
    const panel = this.bodyEl.createDiv({ cls: "neural-content-panel neural-ask-panel" });
    const headingRow = panel.createDiv({ cls: "neural-ask-heading" });
    const heading = headingRow.createDiv();
    heading.createEl("h2", { text: "Ask your vault" });
    heading.createEl("p", {
      cls: "neural-panel-description",
      text: "Relevant excerpts are selected locally, then sent to your chosen provider."
    });

    const providerSelect = headingRow.createEl("select", { cls: "dropdown neural-provider-select" });
    for (const [id, label] of Object.entries(PROVIDER_NAMES)) {
      providerSelect.createEl("option", { text: label, value: id });
    }
    providerSelect.value = this.host.settings.activeProvider;
    providerSelect.addEventListener("change", () => {
      this.host.settings.activeProvider = providerSelect.value as ProviderId;
    });

    const question = panel.createEl("textarea", {
      cls: "neural-question-input",
      attr: {
        rows: "5",
        placeholder: "Summarize what I know about…\nWhat decisions did I make about…\nConnect my notes on…"
      }
    });
    const actions = panel.createDiv({ cls: "neural-ask-actions" });
    const privacy = actions.createDiv({ cls: "neural-privacy-note" });
    setIcon(privacy.createSpan(), "shield-check");
    privacy.createSpan({ text: "Only matching excerpts are shared" });
    const askButton = actions.createEl("button", { cls: "mod-cta", text: "Ask Neural Vault" });
    const output = panel.createDiv({ cls: "neural-answer-output" });
    askButton.addEventListener("click", () =>
      void this.runAsk(question.value, providerSelect.value as ProviderId, askButton, output)
    );
    question.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        askButton.click();
      }
    });
    question.focus();
  }

  private async runAsk(
    question: string,
    provider: ProviderId,
    button: HTMLButtonElement,
    output: HTMLElement
  ): Promise<void> {
    if (!question.trim()) {
      new Notice("Enter a question first.");
      return;
    }
    button.disabled = true;
    button.setText("Searching your vault…");
    output.empty();
    try {
      const results = await this.host.indexer.search(question, 8);
      button.setText(`Asking ${PROVIDER_NAMES[provider]}…`);
      const answer = await askProvider(provider, this.host.settings.providers[provider], question, results);
      output.addClass("is-visible");
      const answerHeader = output.createDiv({ cls: "neural-answer-header" });
      answerHeader.createEl("h3", { text: "Vault answer" });
      const saveButton = answerHeader.createEl("button", { text: "Save as note" });
      const rendered = output.createDiv({ cls: "neural-answer-markdown markdown-rendered" });
      await MarkdownRenderer.render(this.app, answer, rendered, "", this);
      this.renderSources(output, results);
      saveButton.addEventListener("click", async () => {
        const file = await writeAnswer(
          this.app,
          this.host.settings.answerFolder,
          question,
          answer,
          provider,
          results.map((result) => result.note.path)
        );
        await this.host.rebuildIndex();
        new Notice(`Saved ${file.path}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.addClass("is-visible");
      output.createDiv({ cls: "neural-error", text: message });
    } finally {
      button.disabled = false;
      button.setText("Ask Neural Vault");
    }
  }

  private renderSources(parent: HTMLElement, results: SearchResult[]): void {
    const sources = parent.createDiv({ cls: "neural-answer-sources" });
    sources.createDiv({ cls: "neural-sources-label", text: "Local sources" });
    const chips = sources.createDiv({ cls: "neural-source-chips" });
    if (!results.length) {
      chips.createSpan({ cls: "neural-source-chip", text: "No matching notes" });
      return;
    }
    for (const result of results) {
      const chip = chips.createEl("button", { cls: "neural-source-chip", text: result.note.basename });
      chip.addEventListener("click", () => void this.app.workspace.openLinkText(result.note.path, "", false));
    }
  }
}
