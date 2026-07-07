import { Notice } from 'obsidian';

export const isInputFocused = (): boolean => {
  const target = activeDocument.activeElement;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  if ((target as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
};

export const writeConsole = (message: string): void => {
  console.debug(` Key Sequence: ${message}`);
};

export const createNotice = (message: string): void => {
  const msg = 'Key Sequence: ' + message;
  new Notice(msg);
  console.debug(msg);
};
