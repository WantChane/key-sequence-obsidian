import {
  App,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';

// region  Type Shims
interface ObsidianCommand {
  callback: () => void;
  icon: string;
  id: string;
  name: string;
}

interface CommandMap {
  [key: string]: ObsidianCommand;
}

declare module 'obsidian' {
  interface App {
    commands: {
      commands: CommandMap;
      executeCommandById(id: string): void;
    };
  }
}

interface CustomCommand {
  key: string;
  modifiers: string[];
}

type Optional<T> = T | undefined | null;

interface StateMachine<K, T> {
  // Would love to restrict T to a finite set ( T extends Enum ),
  // but it's not possible to do that in TypeScript currently
  advance: (event: K) => T;
}

// endregion

// region Fundamental Domain
enum PressKind {
  ModifierOnly,
  SpecialKey,
  NormalKey,
}

interface Hashable {
  asHash(): string;
}

class KeyPress implements Hashable {
  // region static constructors
  public static ctrl(key: string): KeyPress {
    return new KeyPress(key, false, false, true, false);
  }

  public static alt(key: string): KeyPress {
    return new KeyPress(key, false, true, false, false);
  }

  public static shift(key: string): KeyPress {
    return new KeyPress(key, true, false, false, false);
  }

  public static meta(key: string): KeyPress {
    return new KeyPress(key, false, false, false, true);
  }

  public static just(key: string): KeyPress {
    return new KeyPress(key, false, false, false, false);
  }

  public static ctrlAlt(key: string): KeyPress {
    return new KeyPress(key, false, true, true, false);
  }

  public static fromEvent(event: KeyboardEvent): KeyPress {
    const key = event.key;
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey;
    const alt = event.altKey;
    const meta = event.metaKey;

    return new KeyPress(key, shift, alt, ctrl, meta);
  }

  public static fromCustom(binding: CustomCommand): KeyPress {
    const modifiers = binding.modifiers;

    const key = binding.key;
    const shift = modifiers.contains('Shift');
    const ctrl = modifiers.contains('Ctrl');
    const alt = modifiers.contains('Alt');
    const meta = modifiers.contains('Meta');
    return new KeyPress(key, shift, ctrl, alt, meta);
  }

  public static of(keyPressLike: KeyPress): KeyPress {
    return new KeyPress(
      keyPressLike.key,
      keyPressLike.shift,
      keyPressLike.alt,
      keyPressLike.ctrl,
      keyPressLike.meta,
    );
  }

  // endregion

  public readonly key: string;
  public readonly alt: boolean;
  public readonly ctrl: boolean;
  public readonly shift: boolean;
  public readonly meta: boolean;

  public constructor(
    key: string,
    shift: boolean,
    alt: boolean,
    ctrl: boolean,
    meta: boolean,
  ) {
    this.key = key;
    this.shift = shift;
    this.alt = alt;
    this.ctrl = ctrl;
    this.meta = meta;
  }

  private static readonly keyLabels: Record<string, string> = {
    ' ': 'Space',
  };

  public readonly text = (): string => {
    const metaRepr = this.meta ? '⌘ + ' : '';
    const altRepr = this.alt ? 'Alt + ' : '';
    const ctrlRepr = this.ctrl ? 'Ctrl + ' : '';
    const shiftRepr = this.shift ? '⇧ + ' : '';

    const keyLabel = KeyPress.keyLabels[this.key] ?? this.key;
    return metaRepr + ctrlRepr + altRepr + shiftRepr + keyLabel;
  };
  public readonly kbd = (): HTMLElement => {
    const result = activeDocument.createElement('kbd');
    result.addClass('setting-hotkey');
    result.addClass('key-sequence-kbd');
    result.setText(this.text());
    return result;
  };
  public readonly asHash = (): string => {
    return this.text();
  };

  public readonly kind = (): PressKind => {
    if (
      this.key === null ||
      this.key === undefined ||
      ['Alt', 'Control', 'Shift', 'Meta', 'AltGraph'].includes(this.key)
    ) {
      return PressKind.ModifierOnly;
    }
    if (['Enter', 'Escape', 'Backspace'].includes(this.key)) {
      return PressKind.SpecialKey;
    }

    return PressKind.NormalKey;
  };
}

class KeyMap implements Iterable<KeyPress> {
  public static of(keyMapLike: KeyMap): KeyMap {
    // FIXME : Theoretically possible to create a keymap without a commandID.

    const sequence = keyMapLike.sequence || [];

    const presses = sequence.map((p) => KeyPress.of(p));
    const command = keyMapLike.commandID;
    return new KeyMap(command, presses);
  }

  public sequence: KeyPress[];
  public commandID: string;

  constructor(commandID: string, sequence: KeyPress[]) {
    this.sequence = sequence;
    this.commandID = commandID;
  }

  public [Symbol.iterator](): Iterator<KeyPress> {
    return this.sequence.values();
  }

  public text = (): string => {
    return (
      this.commandID +
      ' = ' +
      this.sequence.map((press) => press.text()).join(' => ')
    );
  };
}

interface KeyBinding {
  hotkeys: KeyMap[];
}

// endregion

// region Matching of existing keymaps
type HashIter = Iterable<Hashable>;

class TrieNode<T> {
  public children = new Map<string, TrieNode<T>>();

  public value: Optional<T>;

  public child(key: string): Optional<TrieNode<T>> {
    return this.children.get(key);
  }

  public addChild(key: string, child: TrieNode<T>): void {
    this.value = null;
    this.children.set(key, child);
  }

  public leaves(): TrieNode<T>[] {
    if (this.isLeaf()) {
      return [this];
    }

    let result: TrieNode<T>[] = [];

    this.children.forEach((child, _) => {
      result = result.concat(child.leaves());
    });

    return result;
  }

  public leafValues(): T[] {
    return this.leaves().map((node) => node.value);
  }

  public isLeaf(): boolean {
    return this.children.size === 0;
  }

  public setValue(value: T): void {
    this.value = value;
  }
}

class Trie<T extends HashIter> {
  public static from<K extends HashIter>(iter: K[]): Trie<K> {
    const trie = new Trie<K>();
    trie.addAll(iter);
    return trie;
  }

  private readonly root: TrieNode<T>;

  constructor() {
    this.root = new TrieNode();
  }

  public addAll(iter: T[]): Trie<T> {
    for (const item of iter) {
      this.add(item);
    }
    return this;
  }

  public add(composite: T): Trie<T> {
    // FIXME : Honestly, very sus implementation
    let lastSeenNode = this.root;
    for (const component of composite) {
      const key = component.asHash();
      const child = lastSeenNode.child(key) || new TrieNode();
      lastSeenNode.addChild(key, child);
      lastSeenNode = child;
    }
    if (lastSeenNode.value !== undefined) {
      throw new Error('Duplicate keymap');
    }
    lastSeenNode.setValue(composite);
    return this;
  }

  public bestMatch(sequence: Hashable[]): Optional<TrieNode<T>> {
    let lastNode = this.root;
    for (const keyPress of sequence) {
      const key = keyPress.asHash();
      const child = lastNode.child(key);
      if (!child) {
        return null;
      }
      lastNode = child;
    }

    return lastNode;
  }
}

enum MatchKind {
  NoMatch,
  PartialMatch,
  FullMatch,
}

enum MatchState {
  EmptyMatch,
  StartedMatch,
  RetainedMatch,
  ImprovedMatch,
  SuccessMatch,
  InvalidMatch,
}

enum MatchStateKind {
  Initial,
  Flow,
  Terminal,
}

class MatchMachine implements StateMachine<KeyPress, MatchState> {
  private readonly trie: Trie<KeyMap>;
  private currentState: MatchState;
  private currentSequence: KeyPress[];
  private currentMatches: KeyMap[];

  constructor(trie: Trie<KeyMap>) {
    this.trie = trie;
    this.currentState = MatchState.EmptyMatch;
    this.currentSequence = [];
    this.currentMatches = [];
  }

  public advance = (keypress: KeyPress): MatchState => {
    const macroState = this.stateKind();
    const wasAlreadySearching = macroState === MatchStateKind.Flow;
    if (macroState === MatchStateKind.Terminal) {
      // Reset and try again.
      this.currentState = MatchState.EmptyMatch;
      this.currentSequence = [];
      this.currentMatches = [];
      return this.advance(keypress);
    }
    if (keypress.kind() === PressKind.ModifierOnly) {
      this.currentState = [
        MatchState.EmptyMatch,
        MatchState.InvalidMatch,
        MatchState.SuccessMatch,
      ].includes(this.currentState)
        ? MatchState.EmptyMatch
        : MatchState.RetainedMatch;

      return this.currentState;
    }

    this.currentSequence.push(keypress);
    const bestMatch = this.trie.bestMatch(this.currentSequence);
    const matchKind = interpretMatch(bestMatch);
    this.currentMatches = bestMatch ? bestMatch.leafValues() : [];

    switch (matchKind) {
      case MatchKind.NoMatch:
        this.currentSequence = [];
        this.currentState = wasAlreadySearching
          ? MatchState.InvalidMatch
          : MatchState.EmptyMatch;
        break;
      case MatchKind.PartialMatch:
        this.currentState = wasAlreadySearching
          ? MatchState.ImprovedMatch
          : MatchState.StartedMatch;
        break;
      case MatchKind.FullMatch:
        this.currentState = wasAlreadySearching
          ? MatchState.SuccessMatch
          : // Very sus to reach success state at first try.
          MatchState.SuccessMatch;
        break;
    }

    return this.currentState;
  };

  public allMatches = (): readonly KeyMap[] => {
    return this.currentMatches;
  };

  public fullMatch = (): Optional<KeyMap> => {
    const numMatches = this.allMatches().length;
    const isFullMatch = this.currentState === MatchState.SuccessMatch;

    // Sanity checking.
    if (isFullMatch && numMatches !== 1) {
      writeConsole(
        'State Machine in FullMatch state, but availableHotkeys.length contains more than 1 element. This is definitely a bug.',
      );
      return null;
    }

    if (isFullMatch && numMatches === 1) {
      return this.currentMatches[0];
    }
    return null;
  };

  public stateKind = (): MatchStateKind => {
    if (this.currentState === MatchState.EmptyMatch) {
      return MatchStateKind.Initial;
    }

    const flowStates = [
      MatchState.StartedMatch,
      MatchState.RetainedMatch,
      MatchState.ImprovedMatch,
    ];

    return flowStates.includes(this.currentState)
      ? MatchStateKind.Flow
      : MatchStateKind.Terminal;
  };
}

class MatchHandler {
  private trie: Trie<KeyMap>;
  private machine: MatchMachine;
  private readonly parent: KeySequence;
  private enabled: boolean;

  public constructor(parent: KeySequence) {
    this.parent = parent;
    this.enabled = true;
    this.setKeymap(parent.settings.hotkeys);
  }

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) {
      return;
    }

    if (isInputFocused()) {
      return;
    }

    const keypress = KeyPress.fromEvent(event);
    const machineState = this.machine.advance(keypress);

    if (this.machine.stateKind() !== MatchStateKind.Initial) {
      event.preventDefault();
      event.stopPropagation();

      if (machineState === MatchState.SuccessMatch) {
        const keymap = this.machine.fullMatch();
        this.emit(keymap);
      }
    }
  };

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public emit(keymap: Optional<KeyMap>): void {
    if (keymap) {
      this.parent.invokeCommand(keymap.commandID);
      return;
    }

    writeConsole(
      'Fully matched an prefix, but without a corresponding Keymap. This is definitely a bug.',
    );
  }

  public setKeymap(keymaps: KeyMap[]): void {
    this.trie = Trie.from(keymaps || []);
    this.machine = new MatchMachine(this.trie);
  }

  public findMatchingKeymaps(presses: KeyPress[]): KeyMap[] {
    const matches = this.trie.bestMatch(presses);
    return matches ? matches.leafValues() : [];
  }
}

// endregion

// region Recording of new keymaps
enum RecordingState {
  EmptySequence,
  FirstKey,
  AddedKeys,
  WaitingInput,
  DeletedKey,
  PendingAddition,
  PendingDeletion,
  FinishedMapping,
}

enum PendingChoice {
  KeepLiteral,
  DiscardLiteral,
  DeletePrevious,
  Finish,
  Unknown,
}

class RecordingMachine implements StateMachine<KeyPress, RecordingState> {
  private currentState: RecordingState;
  private readonly currentSequence: KeyPress[];

  constructor() {
    this.currentState = RecordingState.EmptySequence;
    this.currentSequence = [];
  }

  public readonly advance = (keyPress: KeyPress): RecordingState => {
    const classification = keyPress.kind();

    if (classification === PressKind.ModifierOnly) {
      return this.currentState;
    }

    if (this.currentState === RecordingState.FinishedMapping) {
      // Explicitly state that it can be re-started without loss.
      this.currentState = RecordingState.WaitingInput;
      return this.advance(keyPress);
    }

    if (
      this.currentState === RecordingState.PendingAddition ||
      this.currentState === RecordingState.PendingDeletion
    ) {
      const previousLiteral = this.currentSequence.pop();
      const action = this.interpretAction(keyPress);

      switch (action) {
        case PendingChoice.KeepLiteral:
          this.currentSequence.push(previousLiteral);
          this.currentState = RecordingState.AddedKeys;
          break;
        case PendingChoice.DiscardLiteral:
          this.currentState = RecordingState.WaitingInput;
          break;
        case PendingChoice.DeletePrevious:
          this.currentSequence.pop();
          this.currentState = RecordingState.DeletedKey;
          break;
        case PendingChoice.Finish:
          this.currentState = RecordingState.FinishedMapping;
          break;
        default:
          this.currentSequence.push(previousLiteral);
          break;
      }
    } else {
      this.currentSequence.push(keyPress);
      if (classification === PressKind.SpecialKey) {
        this.currentState =
          keyPress.key === 'Enter'
            ? RecordingState.PendingAddition
            : RecordingState.PendingDeletion;
      } else {
        this.currentState =
          this.currentSequence.length === 1
            ? RecordingState.FirstKey
            : RecordingState.AddedKeys;
      }
    }

    return this.currentState;
  };

  public readonly presses = (): KeyPress[] => {
    return this.currentSequence;
  };
  public readonly documentRepresentation = (): HTMLElement[] => {
    return this.presses().map((press) => press.kbd());
  };

  private interpretAction(keypress: KeyPress): PendingChoice {
    if (keypress.ctrl && keypress.alt && keypress.key === 'Enter') {
      return PendingChoice.Finish;
    }
    if (keypress.key === 'Enter') {
      return PendingChoice.KeepLiteral;
    } else if (
      keypress.key === 'Backspace' &&
      this.currentState === RecordingState.PendingDeletion
    ) {
      return PendingChoice.DeletePrevious;
    } else if (
      keypress.key === 'Backspace' &&
      this.currentState === RecordingState.PendingAddition
    ) {
      return PendingChoice.DiscardLiteral;
    }
    return PendingChoice.Unknown;
  }
}

class RecordingModal extends Modal {
  private readonly parent: KeySequenceSettingTab;
  private readonly registerMachine: RecordingMachine;
  private readonly commandId: string;
  private currentSequence: KeyPress[];

  constructor(parent: KeySequenceSettingTab, commandId: string) {
    super(parent.app);
    this.parent = parent;
    this.commandId = commandId;
    this.registerMachine = new RecordingMachine();
    this.currentSequence = [];
  }

  public readonly onOpen = (): void => {
    this.parent.plugin.setMatchHandlerEnabled(false);
    this.renderContent(this.registerMachine.documentRepresentation());

    activeDocument.addEventListener('keydown', this.handleKeyDown);
  };

  public readonly onClose = (): void => {
    activeDocument.removeEventListener('keydown', this.handleKeyDown);
    this.parent.plugin.setMatchHandlerEnabled(true);
    this.parent.display();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    event.preventDefault();
    const keyPress = KeyPress.fromEvent(event);
    const registerState = this.registerMachine.advance(keyPress);
    this.currentSequence = this.registerMachine.presses();

    writeConsole(
      `An keypress resulted in ${RecordingState[registerState]} state.`,
    );

    switch (registerState) {
      case RecordingState.EmptySequence:
      case RecordingState.WaitingInput:
      case RecordingState.FirstKey:
      case RecordingState.DeletedKey:
      case RecordingState.AddedKeys:
        this.renderNormally();
        return;

      case RecordingState.PendingDeletion:
      case RecordingState.PendingAddition:
        this.renderPending(registerState);
        return;

      case RecordingState.FinishedMapping:
        this.saveSequence();
        return;
    }
  };

  private readonly renderContent = (
    inKeySequence: HTMLElement[],
    inAdditionalContent?: HTMLElement[],
  ): void => {
    const elements = inKeySequence || [];
    const additionalContent = inAdditionalContent || [];
    this.contentEl.empty();

    const headerSetting = new Setting(this.contentEl)
      .setName('Adding keymap for command ')
      .setHeading();
    headerSetting.nameEl.createEl('kbd', { text: this.commandId });

    const introText = activeDocument.createElement('div');
    introText.addClass('setting-hotkey');
    introText.addClass('key-sequence-scroll');
    if (elements.length === 0) {
      const prompt = activeDocument.createElement('span');
      prompt.setText('Waiting for keyboard input.');
      introText.appendChild(prompt);
    } else {
      introText.append(...elements);
    }

    this.contentEl.appendChild(introText);
    if (additionalContent) {
      this.contentEl.append(...additionalContent);
    }
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText('Save');
      button.onClick(() => {
        this.saveSequence();
      });
    });
  };

  private readonly saveSequence = (): void => {
    const conflicts = this.parent.conflicts(this.currentSequence);
    if (conflicts.length >= 1) {
      // todo handle this properly
      createNotice('There are conflicts with your keyPresses!');
    } else {
      const newKeyMap = new KeyMap(this.commandId, this.currentSequence);
      this.parent.addKeymap(newKeyMap);
      const sequenceRepr = newKeyMap.sequence
        .map((key) => key.text())
        .join(' => ');
      createNotice(`Command  ${this.commandId}
           can now be invoked by ${sequenceRepr}`);
      this.close();
    }
  };

  private readonly renderNormally = (): void => {
    this.renderContent(this.registerMachine.documentRepresentation());
  };
  private readonly renderPending = (mappingState: RecordingState): void => {
    // Inplace mutation :(
    const elements = this.registerMachine.documentRepresentation();
    const lastElement = elements[elements.length - 1];
    lastElement.addClass('key-sequence-pending');

    const enter = KeyPress.just('Enter').kbd();
    enter.addClass('key-sequence-kbd-confirm');
    const backspace = KeyPress.just('Backspace').kbd();
    backspace.addClass('key-sequence-kbd-cancel');

    const ctrlAltEnter = KeyPress.ctrlAlt('Enter').kbd();
    const pressLiteral = lastElement.cloneNode(true) as HTMLElement;
    pressLiteral.removeClass('key-sequence-pending');

    const discardOrRemoves =
      mappingState === RecordingState.PendingAddition
        ? ' will discard this input.'
        : ' will delete the previous input.';

    const confirmText = activeDocument.createElement('p');
    confirmText.append(
      'Did you mean literal ',
      pressLiteral,
      '?',
      activeDocument.createElement('br'),
      enter,
      ' will add it to the sequence.',
      activeDocument.createElement('br'),
      backspace,
      discardOrRemoves,
      activeDocument.createElement('br'),
      ctrlAltEnter,
      ' will discard pending changes and complete.',
    );
    this.renderContent(elements, [confirmText]);
  };
}

class CommandModal extends Modal {
  private readonly parent: KeySequenceSettingTab;
  private commandId: string;

  constructor(parent: KeySequenceSettingTab) {
    super(parent.app);
    this.parent = parent;
  }

  public onOpen(): void {
    new Setting(this.contentEl)
      .setName('Pick a command to create a keymap')
      .setHeading();
    const setting = new Setting(this.contentEl);

    setting.addDropdown((dropdown) => {
      dropdown.selectEl.addClass('key-sequence-command');

      for (const command of this.parent.obsidianCommands()) {
        dropdown.addOption(command.id, command.name);
      }

      const placeHolder = new Option('Select a Command', 'placeholder', true);
      placeHolder.setAttribute('disabled', 'true');
      placeHolder.setAttribute('selected', 'true');
      placeHolder.setAttribute('hidden', 'true');
      dropdown.selectEl.append(placeHolder);

      dropdown.setValue('placeholder');
      dropdown.onChange((selectedId) => {
        this.commandId = selectedId;
      });
      dropdown.selectEl.focus();
    });

    setting.addButton((button) => {
      button.setButtonText('OK');
      button.onClick(() => {
        if (
          this.commandId === null ||
          this.commandId === undefined ||
          this.commandId === ''
        ) {
          createNotice('Select a command to register');
          return;
        }

        const registerer = new RecordingModal(this.parent, this.commandId);
        registerer.open();
        this.close();
      });
    });
  }
}

// endregion

class KeySequenceSettingTab extends PluginSettingTab {
  public commands: ObsidianCommand[];
  public readonly plugin: KeySequence;

  constructor(plugin: KeySequence) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.app = plugin.app;
  }

  public display(): void {
    this.refreshCommands();

    const containerEl = this.containerEl;
    containerEl.empty();

    new Setting(containerEl).setName('Existing hotkeys').setHeading();
    for (let i = 0; i < this.currentKeymaps().length; i++) {
      this.displayExisting(i);
    }

    new Setting(containerEl).addButton((button) => {
      button.setButtonText('New keymap').onClick(() => {
        new CommandModal(this).open();
      });
    });
  }

  public refreshCommands(): void {
    this.commands = listCommands(this.app);
  }

  public conflicts(keyPresses: KeyPress[]): KeyMap[] {
    // todo validate properly
    return this.plugin.findMatchingKeymaps(keyPresses) || [];
  }

  public obsidianCommands(): ObsidianCommand[] {
    return this.commands;
  }

  public addKeymap(keymap: KeyMap): void {
    writeConsole(`Adding keymap: ${keymap.text()}`);

    const newHotkeys = [...this.currentKeymaps()].concat(keymap);

    this.saveKeymap(newHotkeys);
  }

  public removeKeymap(positionId: number): void {
    const currentHotkeys = this.currentKeymaps();
    const toRemove = currentHotkeys[positionId];
    writeConsole(`Removing keymap: ${toRemove.text()}`);

    const newKeymap = [];
    for (let i = 0; i < currentHotkeys.length; i++) {
      if (i !== positionId) {
        newKeymap.push(currentHotkeys[i]);
      }
    }

    this.saveKeymap(newKeymap);
  }

  public updateKeymap(positionId: number, keyMap: KeyMap): void {
    writeConsole(`Updating keymap at position ${positionId}: ${keyMap.text()}`);
    const keyMaps = [...this.currentKeymaps()];
    keyMaps[positionId] = keyMap;
    this.saveKeymap(keyMaps);
  }

  private saveKeymap(keymaps: KeyMap[]): void {
    this.plugin.persistKeymaps(keymaps);
  }

  private displayExisting(positionId: number): void {
    const containerEl = this.containerEl;
    const thisKeymap = this.currentKeymaps()[positionId];

    const setting = new Setting(containerEl);
    setting.addDropdown((dropdown) => {
      for (const command of this.commands) {
        dropdown.addOption(command.id, command.name);
      }
      dropdown.onChange((newCommand) => {
        const newKeyMap = KeyMap.of(thisKeymap);
        newKeyMap.commandID = newCommand;
        this.updateKeymap(positionId, newKeyMap);
      });

      dropdown.setValue(thisKeymap.commandID);
      dropdown.selectEl.addClass('key-sequence-command');
    });
    setting.addExtraButton((button) => {
      button
        .setIcon('cross')
        .setTooltip('Delete shortcut')
        .extraSettingsEl.addClass('key-sequence-delete');

      button.onClick(() => {
        this.removeKeymap(positionId);
        this.display();
      });
    });
    setting.infoEl.remove();
    const settingControl = setting.settingEl.children[0];

    const keySetter = activeDocument.createElement('div');
    keySetter.addClass('setting-hotkey');

    const kbds = thisKeymap.sequence.map((press) => press.kbd());
    keySetter.append(...kbds);

    keySetter.addEventListener('click', (_: Event) =>
      new RecordingModal(this, thisKeymap.commandID).open(),
    );

    settingControl.insertBefore(keySetter, settingControl.children[0]);

    const appendText = activeDocument.createElement('span');
    appendText.addClass('key-sequence-setting-append-text');
    appendText.setText('To');
    settingControl.insertBefore(appendText, settingControl.children[1]);
  }

  private currentSettings(): KeyBinding {
    return this.plugin.settings;
  }

  private currentKeymaps(): KeyMap[] {
    return this.currentSettings().hotkeys;
  }
}

export default class KeySequence extends Plugin {
  public settings: KeyBinding;
  private settingsTab: KeySequenceSettingTab;
  private matchHandler: MatchHandler;
  private vimMode: string = 'normal';

  public async onload(): Promise<void> {
    writeConsole('Started Loading.');

    await this.loadSavedSettings();
    await this.registerEventsAndCallbacks();

    this.settingsTab = new KeySequenceSettingTab(this);
    this.addSettingTab(this.settingsTab);
    writeConsole('Registered Setting Tab.');

    this.registerVimModeMonitor();
    writeConsole('Registered Vim mode monitor.');

    writeConsole('Finished Loading.');
  }

  public onunload(): void {
    writeConsole('Unloading plugin.');
  }

  // region Vim mode integration
  //
  // The vim-mode-change listener pattern and getCodeMirror accessor below
  // are adapted from vim-im-select-obsidian by ALONELUR (MIT License).
  // https://github.com/ALONELUR/vim-im-select-obsidian
  //
  private registerVimModeMonitor(): void {
    const updateVimListener = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;

      const cm = this.getCodeMirror(view);
      if (!cm) return;

      cm.off('vim-mode-change', this.onVimModeChanged);
      cm.on('vim-mode-change', this.onVimModeChanged);
    };

    this.app.workspace.on('active-leaf-change', updateVimListener);
    // Also run immediately for the already-active leaf.
    updateVimListener();
  }

  private getCodeMirror(view: any): any {
    return view?.sourceMode?.cmEditor?.cm?.cm;
  }

  private readonly onVimModeChanged = (modeObj: any): void => {
    if (!modeObj || modeObj.mode === undefined) return;

    const previousMode = this.vimMode;
    this.vimMode = modeObj.mode;

    if (this.vimMode === 'normal') {
      this.matchHandler.setEnabled(true);
    } else if (previousMode === 'normal') {
      // Transitioned away from normal → disable hotkeys.
      this.matchHandler.setEnabled(false);
    }
  };
  // endregion

  public invokeCommand(commandID: string): void {
    if (commandID) {
      this.app.commands.executeCommandById(commandID);
    }
  }

  public findMatchingKeymaps(presses: KeyPress[]): KeyMap[] {
    return this.matchHandler.findMatchingKeymaps(presses);
  }

  public setMatchHandlerEnabled(enabled: boolean): void {
    this.matchHandler.setEnabled(enabled);
  }

  public persistKeymaps(newKeymaps: KeyMap[]): void {
    this.settings.hotkeys = newKeymaps;
    this.saveData(this.settings)
      .then(() => {
        this.matchHandler.setKeymap(newKeymaps);
      })
      .catch(() => {
        createNotice('Error while Saving Keymaps.');
      });
  }

  private readonly registerEventsAndCallbacks = async (): Promise<void> => {
    writeConsole('Registering necessary event callbacks');

    this.registerDomEvent(
      document,
      'keydown',
      this.matchHandler.handleKeyDown,
      { capture: true },
    );
    writeConsole('Registered capture-phase "keydown" listener on document.');

    const openModalCommand = {
      id: 'register-modal',
      name: 'Open Register Modal',
      callback: () => {
        this.settingsTab.refreshCommands();
        new CommandModal(this.settingsTab).open();
      },
    };
    this.addCommand(openModalCommand);
    writeConsole('Registered open modal command');
  };

  private readonly loadSavedSettings = async (): Promise<void> => {
    writeConsole('Loading previously saved settings.');

    const raw = (await this.loadData()) as Partial<KeyBinding> | null;
    try {
      const hotkeys = (raw?.hotkeys ?? []).map((km) => KeyMap.of(km));
      this.settings = { hotkeys };
      writeConsole('Loaded previous settings.');
    } catch {
      writeConsole('A failure occured while parsing the saved settings.');
      createNotice(
        'A failure occured while loading the saved settings. Fallbacking to defaults.',
      );
      this.settings = { hotkeys: [] };
    }
    this.matchHandler = new MatchHandler(this);
  };
}

// region consts and utils
const listCommands = (app: App): ObsidianCommand[] => {
  return Object.values(app.commands.commands);
};
const interpretMatch = (bestMatch: Optional<TrieNode<KeyMap>>): MatchKind => {
  if (!bestMatch) {
    return MatchKind.NoMatch;
  }
  if (bestMatch.isLeaf()) {
    return MatchKind.FullMatch;
  }
  return MatchKind.PartialMatch;
};

const isInputFocused = (): boolean => {
  const target = activeDocument.activeElement;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  const el = target as HTMLElement;
  if (el.isContentEditable && !el.closest('.cm-editor')) {
    return true;
  }

  return false;
};

const writeConsole = (message: string): void => {
  console.debug(` Key Sequence: ${message}`);
};
const createNotice = (message: string): void => {
  new Notice('Key Sequence: ' + message);
};
// endregion
