/** Human file size (B … TB) for the package list. */
const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${SIZE_UNITS[unit] ?? 'B'}`;
}
