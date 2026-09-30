import { describe, expect, it } from 'vitest';
import { isValidAccelerator } from '@shared/settings';
import { acceleratorFromEvent, displayAccelerator } from './accelerator';

const key = (
  value: string,
  modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
) => ({
  key: value,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

describe('pause hotkey accelerators (§19)', () => {
  it('turns key events into Electron accelerators', () => {
    expect(acceleratorFromEvent(key(' ', { ctrlKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+Space',
    );
    expect(acceleratorFromEvent(key('p', { altKey: true }))).toBe('Alt+P');
    expect(acceleratorFromEvent(key('F9', { ctrlKey: true }))).toBe('CommandOrControl+F9');
    expect(acceleratorFromEvent(key('Shift', { shiftKey: true }))).toBeNull();
  });

  it('requires a modifier and one supported key', () => {
    expect(isValidAccelerator('CommandOrControl+Shift+Space')).toBe(true);
    expect(isValidAccelerator('P')).toBe(false);
    expect(isValidAccelerator('Shift+Shift+P')).toBe(false);
    expect(isValidAccelerator('Alt+Tab')).toBe(false);
  });

  it('shows Windows notation', () => {
    expect(displayAccelerator('CommandOrControl+Shift+Space')).toBe('Ctrl + Shift + Space');
  });
});
