import { Optional, PressKind, StateMachine, KeyPress, KeyMap, Trie, TrieNode } from './domain';
import { isInputFocused } from './utils';

export interface CommandInvoker {
  invokeCommand(commandID: string): void;
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

const interpretMatch = (
  bestMatch: Optional<TrieNode<KeyMap>>,
): MatchKind => {
  if (!bestMatch) {
    return MatchKind.NoMatch;
  }
  if (bestMatch.isLeaf()) {
    return MatchKind.FullMatch;
  }
  return MatchKind.PartialMatch;
};

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
        this.currentState = MatchState.SuccessMatch;
        break;
    }

    return this.currentState;
  };

  public fullMatch = (): Optional<KeyMap> => {
    const numMatches = this.currentMatches.length;
    const isFullMatch = this.currentState === MatchState.SuccessMatch;

    if (isFullMatch && numMatches !== 1) {
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

export class MatchHandler {
  private trie: Trie<KeyMap>;
  private machine: MatchMachine;
  private readonly parent: CommandInvoker;
  private enabled: boolean;

  public constructor(parent: CommandInvoker) {
    this.parent = parent;
    this.enabled = true;
    this.trie = new Trie<KeyMap>();
    this.machine = new MatchMachine(this.trie);
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
    }
  }

  public setKeymap(keymaps: KeyMap[]): void {
    this.trie = Trie.from(keymaps);
    this.machine = new MatchMachine(this.trie);
  }
}
