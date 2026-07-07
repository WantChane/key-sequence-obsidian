export type Optional<T> = T | undefined | null;

export enum PressKind {
  ModifierOnly,
  SpecialKey,
  NormalKey,
}

export interface Hashable {
  asHash(): string;
}

export type HashIter = Iterable<Hashable>;

export interface StateMachine<K, T> {
  advance: (event: K) => T;
}

export class KeyPress implements Hashable {
  private static readonly keyLabels: Record<string, string> = {
    ' ': 'Space',
  };

  public static fromEvent(event: KeyboardEvent): KeyPress {
    return new KeyPress(
      event.key,
      event.shiftKey,
      event.altKey,
      event.ctrlKey,
      event.metaKey,
    );
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

  public readonly text = (): string => {
    const metaRepr = this.meta ? '\u2318 + ' : '';
    const altRepr = this.alt ? 'Alt + ' : '';
    const ctrlRepr = this.ctrl ? 'Ctrl + ' : '';
    const shiftRepr = this.shift ? '\u21E7 + ' : '';
    const keyLabel = KeyPress.keyLabels[this.key] ?? this.key;
    return metaRepr + ctrlRepr + altRepr + shiftRepr + keyLabel;
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

export class KeyMap implements Iterable<KeyPress> {
  public static of(keyMapLike: KeyMap): KeyMap {
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

export class TrieNode<T> {
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
    this.children.forEach((child) => {
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

export class Trie<T extends HashIter> {
  public static from<T extends HashIter>(items: T[]): Trie<T> {
    const trie = new Trie<T>();
    for (const item of items) {
      trie.add(item);
    }
    return trie;
  }

  private readonly root: TrieNode<T>;

  constructor() {
    this.root = new TrieNode<T>();
  }

  public add(composite: T): Trie<T> {
    let lastSeenNode = this.root;
    for (const component of composite) {
      const key = component.asHash();
      const child = lastSeenNode.child(key) || new TrieNode<T>();
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
