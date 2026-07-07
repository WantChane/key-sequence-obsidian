import { Plugin } from 'obsidian';
import {
  KeySequenceSettings,
  DEFAULT_SETTINGS,
  DEFAULT_CONFIG_TEMPLATE,
  KeySequenceSettingTab,
} from './settings';
import { MatchHandler, CommandInvoker } from './match-handler';
import { parseConfig } from './config-parser';
import { writeConsole, createNotice } from './utils';

declare module 'obsidian' {
  interface App {
    commands: {
      commands: { [key: string]: { id: string; name: string; callback: () => void; icon: string } };
      executeCommandById(id: string): void;
    };
  }
}

export default class KeySequence extends Plugin implements CommandInvoker {
  public settings: KeySequenceSettings;
  private matchHandler: MatchHandler;

  public async onload(): Promise<void> {
    await this.loadSettings();
    await this.reloadConfig();
    this.registerEventsAndCallbacks();
    this.addSettingTab(new KeySequenceSettingTab(this));

    this.addCommand({
      id: 'reload-config',
      name: 'Reload config file',
      callback: async () => {
        await this.reloadConfig();
        createNotice('Config reloaded.');
      },
    });
  }

  public onunload(): void {
    this.matchHandler = null;
  }

  public invokeCommand(commandID: string): void {
    if (commandID) {
      this.app.commands.executeCommandById(commandID);
    }
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  public async reloadConfig(): Promise<void> {
    await this.loadConfigFile();
  }

  private async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<KeySequenceSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
    if (!this.settings.configPath) {
      this.settings.configPath =
        this.app.vault.configDir + '/key-sequence.vimrc';
    }
  }

  private async loadConfigFile(): Promise<void> {
    const path = this.settings.configPath;

    if (!path.trim()) {
      writeConsole('Config path is empty, skipping.');
      this.matchHandler = new MatchHandler(this);
      this.matchHandler.setKeymap([]);
      return;
    }

    try {
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(path);

      if (!exists) {
        writeConsole(`Config file not found, creating: ${path}`);
        await adapter.write(path, DEFAULT_CONFIG_TEMPLATE);
      }

      const text = await adapter.read(path);
      const result = parseConfig(
        text,
        this.settings.embeddedMode ? 'embedded' : 'standalone',
        this.settings.embeddedPrefix,
      );

      for (const err of result.errors) {
        createNotice(`Line ${err.line}: ${err.message}`);
      }

      this.matchHandler = new MatchHandler(this);
      this.matchHandler.setKeymap(result.keymaps);
    } catch (e) {
      writeConsole(`Failed to load config: ${e}`);
      createNotice(`Failed to load config: ${e}`);
      this.matchHandler = new MatchHandler(this);
      this.matchHandler.setKeymap([]);
    }
  }

  private readonly registerEventsAndCallbacks = (): void => {
    this.registerDomEvent(document, 'keydown', this.matchHandler.handleKeyDown, {
      capture: true,
    });
  };
}
