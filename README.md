# Key Sequence

Assign multi-key sequences to any Obsidian command, configured via a vimrc-style file.

## How it works

Instead of a single chord, you press a **sequence of keys** to trigger a command. For example, press <kbd>Space</kbd> then <kbd>h</kbd> to toggle left sidebar.

No key sequences are pre-configured. You define your own in the config file.

## Configuration

Key sequences are defined in a config file using vimrc-style syntax.

By default, the plugin looks for `.obsidian/key-sequence.vimrc` in your vault. You can change this path in the plugin settings.

### Syntax

```
" comment
let mapleader = "<key>"
gmap <key-sequence> :<command-id><CR>
```

- Lines starting with `"` are comments.
- `let mapleader` defines a leader key referenced by `<leader>` in sequences.
  **Note:** This plugin has no Vim-style leader key. `<leader>` is simply a placeholder that gets substituted with the mapleader value. For example, `let mapleader = "<Space>"` means `<leader>h` behaves identically to writing `<Space>h`.
- `gmap` maps a key sequence to an Obsidian command ID.

### Examples

```
let mapleader = "<Space>"

gmap <leader>e :editor:focus<CR>
```

## Settings

Open Settings → **Key Sequence** to configure:

- **Config file path** — Relative path from vault root. Defaults to `.obsidian/key-sequence.vimrc`. The file is auto-created with a template on first load if it doesn't exist.

- **Embedded mode** — Merge key sequences into another plugin's config file (e.g. Obsidian-Vimrc-Support's `.obsidian.vimrc`). When enabled, only lines prefixed with the marker below are parsed.

- **Line prefix marker** — Only visible when embedded mode is on. Defines the prefix that marks a line as a key sequence definition (default: `" ks>`).

### Embedded mode example

In your `.obsidian.vimrc`:

```
let mapleader = "<Space>"
" ks> let mapleader = "<Space>"

exmap file_explorer_reveal_active_file obcommand file-explorer:reveal-active-file
nmap <leader>e :file_explorer_reveal_active_file<CR>

" ks> gmap <leader>e :editor:focus<CR>
```

## Usage

1. Create your config file (or let the plugin auto-create it).
2. Define your key sequences using the syntax above.
3. Use the **Key Sequence: Reload config file** command to apply changes without restarting Obsidian.

Key sequences are disabled when an input, textarea, select, or contentEditable element is focused, so they won't interfere with typing.

## Installation

### Manual

Copy `main.js`, `manifest.json` to
`<vault>/.obsidian/plugins/key-sequence-obsidian/`.

## Notes

This plugin captures keydown events at the document level to match key sequences. Conflicts with other hotkeys are possible — if a sequence prefix matches another binding, the key sequence takes priority while a partial match is in progress.

Debug logging is written to the console with the `Key Sequence:` prefix.
