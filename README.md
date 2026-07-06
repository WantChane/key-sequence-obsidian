# Key Sequence

Assign multi-key sequences to any Obsidian command, including those from other
plugins.

## How it works

Instead of a single chord, you press a **sequence of keys** to trigger a
command. For example, press <kbd>Ctrl</kbd>+<kbd>b</kbd> then
<kbd>h</kbd> to focus the pane to the left.

No key sequences are pre-configured. You define your own.

## Vim mode

When Obsidian's Vim mode is active, key sequences are **disabled** in insert,
visual, and replace modes — they only work from normal mode. This prevents
key sequences from interfering with typing.

## Usage

### Adding a keymap

1. Open Settings → **Key Sequence**
2. Click **New keymap**
3. Select a command from the dropdown
4. Press your key sequence (e.g. <kbd>Ctrl</kbd>+<kbd>b</kbd> then <kbd>h</kbd>)
5. Press <kbd>Enter</kbd> to confirm each key, or
   <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Enter</kbd> to finish
6. Click **Save**

You can also open the recording modal from anywhere via the **Key Sequence:
Open Register Modal** command in the command palette.

### Managing keymaps

Each configured keymap shows:

- The key sequence on the left (click to re-record)
- A command dropdown to change the target command
- A delete button to remove the keymap

## Installation

### Manual

Copy `main.js`, `manifest.json`, and `styles.css` to
`<vault>/.obsidian/plugins/key-sequence-obsidian/`.

## Notes

This plugin captures keydown events at the document level to match key
sequences. Conflicts with other hotkeys are possible — if a sequence prefix
matches another binding, the key sequence takes priority while a partial
match is in progress.

## Acknowledgments

Vim mode integration adapted from
[vim-im-select-obsidian](https://github.com/ALONELUR/vim-im-select-obsidian)
by ALONELUR (MIT License).
