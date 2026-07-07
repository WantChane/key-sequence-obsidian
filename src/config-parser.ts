import { KeyPress, KeyMap, Optional } from './domain';

export interface ConfigError {
  line: number;
  message: string;
}

export interface ConfigResult {
  keymaps: KeyMap[];
  errors: ConfigError[];
}

enum LineType {
  Comment,
  Empty,
  MapLeader,
  Sequence,
  Unknown,
}

type LineToken =
  | { type: LineType.Comment; lineNumber: number; raw: string }
  | { type: LineType.Empty; lineNumber: number; raw: string }
  | {
    type: LineType.MapLeader;
    lineNumber: number;
    raw: string;
    value: string;
  }
  | {
    type: LineType.Sequence;
    lineNumber: number;
    raw: string;
    keySequence: string;
    commandID: string;
  }
  | { type: LineType.Unknown; lineNumber: number; raw: string };

const VIM_KEY_MAP: Record<string, string> = {
  Space: ' ',
  Tab: 'Tab',
  CR: 'Enter',
  Enter: 'Enter',
  Esc: 'Escape',
  BS: 'Backspace',
  Backspace: 'Backspace',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Del: 'Delete',
  Delete: 'Delete',
};

for (let i = 1; i <= 12; i++) {
  const key = `F${i}`;
  VIM_KEY_MAP[key] = key;
}

// region Preprocessor
function preprocess(
  text: string,
  mode: 'standalone' | 'embedded',
  embeddedPrefix: string,
): string[] {
  const lines = text.split('\n');
  if (mode === 'standalone') {
    return lines;
  }
  return lines.map((line) =>
    line.startsWith(embeddedPrefix) ? line.slice(embeddedPrefix.length) : '',
  );
}
// endregion

// region Lexer
const MAPLEADER_RE = /^\s*let\s+mapleader\s*=\s*"([^"]*)"$/;
const KEYMAP_RE = /^\s*gmap\s+(\S+)\s+:(.+)<CR>$/;

function lexLine(line: string, lineNumber: number): LineToken {
  const mapleaderMatch = line.match(MAPLEADER_RE);
  if (mapleaderMatch) {
    return {
      type: LineType.MapLeader,
      lineNumber,
      raw: line,
      value: mapleaderMatch[1],
    };
  }

  const keymapMatch = line.match(KEYMAP_RE);
  if (keymapMatch) {
    return {
      type: LineType.Sequence,
      lineNumber,
      raw: line,
      keySequence: keymapMatch[1],
      commandID: keymapMatch[2],
    };
  }

  if (/^\s*"/.test(line)) {
    return { type: LineType.Comment, lineNumber, raw: line };
  }

  if (/^\s*$/.test(line)) {
    return { type: LineType.Empty, lineNumber, raw: line };
  }

  return { type: LineType.Unknown, lineNumber, raw: line };
}

function lexLines(
  text: string,
  mode: 'standalone' | 'embedded',
  embeddedPrefix: string,
): LineToken[] {
  const lines = preprocess(text, mode, embeddedPrefix);
  return lines.map((line, i) => lexLine(line, i + 1));
}
// endregion

// region Tokenizer (key sequence string → individual key tokens)
function tokenizeKeySequence(seq: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < seq.length) {
    if (seq[i] === '<') {
      const end = seq.indexOf('>', i);
      if (end === -1) {
        return [];
      }
      tokens.push(seq.slice(i, end + 1));
      i = end + 1;
    } else {
      tokens.push(seq[i]);
      i++;
    }
  }
  return tokens;
}
// endregion

// region Key token → KeyPress resolver
function parseModifiers(
  parts: string[],
): { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } {
  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  for (const part of parts) {
    switch (part) {
      case 'C':
        ctrl = true;
        break;
      case 'S':
        shift = true;
        break;
      case 'A':
        alt = true;
        break;
      case 'M':
        meta = true;
        break;
    }
  }
  return { ctrl, shift, alt, meta };
}

function resolveKeyName(vimKey: string): string {
  return VIM_KEY_MAP[vimKey] ?? vimKey;
}

function resolveKeyToken(
  token: string,
  mapleader: Optional<KeyPress>,
): Optional<KeyPress> {
  if (token === '<leader>') {
    return mapleader ? KeyPress.of(mapleader) : null;
  }

  if (token.startsWith('<') && token.endsWith('>')) {
    const inner = token.slice(1, -1);
    const parts = inner.split('-');
    const keyName = parts[parts.length - 1];
    const modParts = parts.slice(0, -1);
    const mods = parseModifiers(modParts);
    let resolvedKey = resolveKeyName(keyName);
    if (resolvedKey.length === 1 && /[A-Za-z]/.test(resolvedKey)) {
      resolvedKey = resolvedKey.toLowerCase();
    }
    return new KeyPress(resolvedKey, mods.shift, mods.alt, mods.ctrl, mods.meta);
  }

  let resolvedKey = resolveKeyName(token);
  if (resolvedKey.length === 1 && /[A-Za-z]/.test(resolvedKey)) {
    resolvedKey = resolvedKey.toLowerCase();
  }
  return new KeyPress(resolvedKey, false, false, false, false);
}

function resolveMapLeader(rawValue: string): Optional<KeyPress> {
  return resolveKeyToken(rawValue, null);
}
// endregion

// region Main parser entry point
export function parseConfig(
  text: string,
  mode: 'standalone' | 'embedded',
  embeddedPrefix: string,
): ConfigResult {
  const tokens = lexLines(text, mode, embeddedPrefix);
  const errors: ConfigError[] = [];
  const keymaps: KeyMap[] = [];
  let mapleader: Optional<KeyPress> = null;

  for (const token of tokens) {
    switch (token.type) {
      case LineType.Comment:
      case LineType.Empty:
        break;

      case LineType.MapLeader: {
        const resolved = resolveMapLeader(token.value);
        if (!resolved) {
          errors.push({
            line: token.lineNumber,
            message: `Invalid mapleader value: "${token.value}"`,
          });
        } else {
          mapleader = resolved;
        }
        break;
      }

      case LineType.Sequence: {
        const keyTokens = tokenizeKeySequence(token.keySequence);
        if (keyTokens.length === 0) {
          errors.push({
            line: token.lineNumber,
            message: 'Invalid key sequence (unclosed angle bracket?)',
          });
          break;
        }

        const sequence: KeyPress[] = [];
        let hasError = false;

        for (const kt of keyTokens) {
          const kp = resolveKeyToken(kt, mapleader);
          if (!kp) {
            if (kt === '<leader>' && !mapleader) {
              errors.push({
                line: token.lineNumber,
                message: '<leader> used but mapleader is not set',
              });
            } else {
              errors.push({
                line: token.lineNumber,
                message: `Invalid key token: "${kt}"`,
              });
            }
            hasError = true;
            break;
          }
          sequence.push(kp);
        }

        if (!hasError) {
          keymaps.push(new KeyMap(token.commandID, sequence));
        }
        break;
      }

      case LineType.Unknown:
        errors.push({
          line: token.lineNumber,
          message: `Unrecognized line: "${token.raw.trim()}"`,
        });
        break;
    }
  }

  return { keymaps, errors };
}
// endregion
