import { Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { NEURAL_VAULT_VIEW, NeuralVaultView, type DashboardHost } from "./dashboard";
import { DEFAULT_SETTINGS } from "./defaults";
import { ImportConversationModal } from "./import-modal";
import { VaultIndexer } from "./indexer";
import { writeConversations } from "./note-writer";
import { NeuralVaultSettingTab, type SettingsHost } from "./settings";
import type { ImportedConversation, NeuralVaultSettings } from "./types";

export default class NeuralVaultPlugin extends Plugin implements DashboardHost, SettingsHost {
  settings: NeuralVaultSettings = structuredClone(DEFAULT_SETTINGS);
  indexer!: VaultIndexer;
  private rebuildTimer = 0;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.indexer = new VaultIndexer(this.app, () => this.excludedFolders());

    this.registerView(NEURAL_VAULT_VIEW, (leaf) => new NeuralVaultView(leaf, this));
    this.addSettingTab(new NeuralVaultSettingTab(this.app, this));

    this.addRibbonIcon("brain-circuit", "Open Neural Vault", () => void this.activateView());
    this.addCommand({
      id: "open-neural-vault",
      name: "Open dashboard",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "import-ai-conversations",
      name: "Import AI conversations",
      callback: () => this.openImporter()
    });
    this.addCommand({
      id: "rebuild-neural-index",
      name: "Rebuild local knowledge index",
      callback: async () => {
        await this.rebuildIndex();
        new Notice("Neural Vault index rebuilt.");
      }
    });

    this.registerEvent(this.app.vault.on("create", () => this.queueRebuild()));
    this.registerEvent(this.app.vault.on("modify", () => this.queueRebuild()));
    this.registerEvent(this.app.vault.on("delete", () => this.queueRebuild()));
    this.registerEvent(this.app.vault.on("rename", () => this.queueRebuild()));

    this.app.workspace.onLayoutReady(() => {
      void this.rebuildIndex();
    });
  }

  onunload(): void {
    window.clearTimeout(this.rebuildTimer);
    this.app.workspace.detachLeavesOfType(NEURAL_VAULT_VIEW);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<NeuralVaultSettings> | null;
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...(saved ?? {}),
      providers: {
        ...structuredClone(DEFAULT_SETTINGS.providers),
        ...(saved?.providers ?? {}),
        openai: {
          ...DEFAULT_SETTINGS.providers.openai,
          ...(saved?.providers?.openai ?? {})
        },
        anthropic: {
          ...DEFAULT_SETTINGS.providers.anthropic,
          ...(saved?.providers?.anthropic ?? {})
        },
        gemini: {
          ...DEFAULT_SETTINGS.providers.gemini,
          ...(saved?.providers?.gemini ?? {})
        },
        openrouter: {
          ...DEFAULT_SETTINGS.providers.openrouter,
          ...(saved?.providers?.openrouter ?? {})
        }
      }
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async rebuildIndex(): Promise<void> {
    await this.indexer.rebuild();
  }

  openImporter(): void {
    new ImportConversationModal(this.app, async (conversations) => {
      await this.importConversations(conversations);
    }).open();
  }

  private async importConversations(conversations: ImportedConversation[]): Promise<void> {
    if (!this.indexer.getNotes().length) await this.rebuildIndex();
    const result = await writeConversations(
      this.app,
      conversations,
      this.settings.importFolder,
      (text, limit) => this.indexer.relatedNotes(text, "", limit),
      this.settings.relatedLinks
    );
    await this.rebuildIndex();
    await this.refreshViews();
    new Notice(
      `Imported ${result.files.length} conversation${result.files.length === 1 ? "" : "s"} and ${result.messageCount} messages.`
    );
    const first = result.files[0];
    if (first) await this.app.workspace.getLeaf(false).openFile(first);
  }

  private excludedFolders(): string[] {
    return this.settings.excludedFolders
      .split(",")
      .map((folder) => folder.trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean);
  }

  private queueRebuild(): void {
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      void this.rebuildIndex();
    }, 1200);
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(NEURAL_VAULT_VIEW)[0];
    let leaf: WorkspaceLeaf;
    if (existing) {
      leaf = existing;
    } else {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: NEURAL_VAULT_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private async refreshViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(NEURAL_VAULT_VIEW);
    await Promise.all(
      leaves.map(async (leaf) => {
        if (leaf.view instanceof NeuralVaultView) await leaf.view.refresh();
      })
    );
  }
}
