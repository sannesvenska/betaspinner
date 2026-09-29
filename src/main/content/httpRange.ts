export interface ByteRange {
  start: number;
  /** Inclusive */
  end: number;
}

/**
 * Parses a single-range `Range: bytes=…` header (the only form media elements send).
 * Returns null when absent/unsupported (serve the full file) and 'unsatisfiable' for out-of-bounds ranges.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return null;

  if (startText === '') {
    // Suffix range: last N bytes
    const suffixLength = Number(endText);
    if (suffixLength === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
