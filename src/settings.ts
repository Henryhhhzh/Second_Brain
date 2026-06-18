import { App, PluginSettingTab, Setting } from "obsidian";
import type { NeuralVaultSettings, ProviderId } from "./types";

export interface SettingsHost {
  settings: NeuralVaultSettings;
  saveSettings(): Promise<void>;
  rebuildIndex(): Promise<void>;
}

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude (Anthropic)" },
  { id: "gemini", label: "Gemini (Google)" },
  { id: "openrouter", label: "OpenRouter" }
];

export class NeuralVaultSettingTab extends PluginSettingTab {
  constructor(app: App, private host: SettingsHost) {
    super(app, host as never);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Neural Vault" });
    containerEl.createEl("p", {
      text: "Your graph and search stay local. Note excerpts leave the vault only when you explicitly ask a configured AI provider."
    });

    new Setting(containerEl)
      .setName("Conversation folder")
      .setDesc("Imported AI conversations are saved here as Markdown.")
      .addText((text) =>
        text
          .setPlaceholder("AI Brain/Conversations")
          .setValue(this.host.settings.importFolder)
          .onChange(async (value) => {
            this.host.settings.importFolder = value.trim() || "AI Brain/Conversations";
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Answer folder")
      .setDesc("Saved vault answers are written here.")
      .addText((text) =>
        text
          .setPlaceholder("AI Brain/Answers")
          .setValue(this.host.settings.answerFolder)
          .onChange(async (value) => {
            this.host.settings.answerFolder = value.trim() || "AI Brain/Answers";
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated vault folders excluded from local indexing.")
      .addText((text) =>
        text
          .setPlaceholder(".obsidian, Templates")
          .setValue(this.host.settings.excludedFolders)
          .onChange(async (value) => {
            this.host.settings.excludedFolders = value;
            await this.host.saveSettings();
            await this.host.rebuildIndex();
          })
      );

    new Setting(containerEl)
      .setName("Maximum graph nodes")
      .setDesc("Limits graph rendering work in large vaults.")
      .addSlider((slider) =>
        slider
          .setLimits(100, 2000, 100)
          .setDynamicTooltip()
          .setValue(this.host.settings.maxGraphNodes)
          .onChange(async (value) => {
            this.host.settings.maxGraphNodes = value;
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Related links per import")
      .setDesc("Suggested wiki links appended to each imported conversation.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 10, 1)
          .setDynamicTooltip()
          .setValue(this.host.settings.relatedLinks)
          .onChange(async (value) => {
            this.host.settings.relatedLinks = value;
            await this.host.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "AI providers" });

    new Setting(containerEl)
      .setName("Active provider")
      .setDesc("Used by Ask your vault. Imports do not require an API key.")
      .addDropdown((dropdown) => {
        for (const provider of PROVIDERS) dropdown.addOption(provider.id, provider.label);
        dropdown.setValue(this.host.settings.activeProvider).onChange(async (value) => {
          this.host.settings.activeProvider = value as ProviderId;
          await this.host.saveSettings();
        });
      });

    for (const provider of PROVIDERS) {
      const config = this.host.settings.providers[provider.id];
      new Setting(containerEl)
        .setName(`${provider.label} model`)
        .setDesc("Enter any model ID supported by your account.")
        .addText((text) =>
          text.setValue(config.model).onChange(async (value) => {
            config.model = value.trim();
            await this.host.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName(`${provider.label} API key`)
        .setDesc("Stored in this plugin's local Obsidian data file.")
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("Optional")
            .setValue(config.apiKey)
            .onChange(async (value) => {
              config.apiKey = value.trim();
              await this.host.saveSettings();
            });
        });
    }
  }
}
