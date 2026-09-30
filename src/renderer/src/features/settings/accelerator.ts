/** Electron accelerators for the configurable pause hotkey (game-design §19). */

const KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Pause: 'Pause',
};
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/** Keyboard event → Electron accelerator (Windows notation, `CommandOrControl` for Ctrl). */
export function acceleratorFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key =
    KEY_NAMES[event.key] ??
    (/^F\d{1,2}$/.test(event.key) ? event.key : event.key.length === 1 ? event.key.toUpperCase() : null);
  if (!key) return null;
  const parts = [
    event.ctrlKey && 'CommandOrControl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Super',
    key,
  ].filter((part): part is string => typeof part === 'string');
  return parts.join('+');
}

/** Windows notation for display: CommandOrControl → Ctrl. */
export const displayAccelerator = (accelerator: string): string =>
  accelerator.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
