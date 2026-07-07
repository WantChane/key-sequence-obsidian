import { PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface KeySequenceSettings {
  configPath: string;
  embeddedMode: boolean;
  embeddedPrefix: string;
}

export const DEFAULT_SETTINGS: KeySequenceSettings = {
  configPath: '',
  embeddedMode: false,
  embeddedPrefix: '" ks>',
};

export const DEFAULT_CONFIG_TEMPLATE = [
  '" ============================================================',
  '" Key Sequence configuration file',
  '"',
  '" Syntax:',
  '"   " comment',
  '"   let mapleader = "<key>"',
  '"   gmap <key-sequence> :<command-id><CR>',
  '"',
  '" ============================================================',
  '',
  'let mapleader = "<Space>"',
  '',
  '',
].join('\n');

export interface KeySequencePlugin extends Plugin {
  settings: KeySequenceSettings;
  saveSettings(): Promise<void>;
  reloadConfig(): Promise<void>;
}

export class KeySequenceSettingTab extends PluginSettingTab {
  private readonly plugin: KeySequencePlugin;

  constructor(plugin: KeySequencePlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Config file path')
      .setDesc('Relative path from the vault root.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.configPath)
          .onChange(async (value) => {
            this.plugin.settings.configPath = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Embedded mode')
      .setDesc(
        'Merge the key sequences into another plugin config file. Only lines prefixed with the marker below are parsed.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.embeddedMode)
          .onChange(async (value) => {
            this.plugin.settings.embeddedMode = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.embeddedMode) {
      new Setting(containerEl)
        .setName('Line prefix marker')
        .setDesc('For example, use this prefix to embed key sequences in the Obsidian-vimrc-support config file.')
        .addText((text) =>
          text
            .setPlaceholder('" ks>')
            .setValue(this.plugin.settings.embeddedPrefix)
            .onChange(async (value) => {
              this.plugin.settings.embeddedPrefix = value;
              await this.plugin.saveSettings();
            }),
        );
    }
  }
}
