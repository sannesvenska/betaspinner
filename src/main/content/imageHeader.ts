/**
 * Minimal header parsers: dimensions + "is animated" without decoding pixels.
 * Returns null for unknown or truncated data – callers treat dimensions as unknown.
 */
export interface ImageInfo {
  width: number;
  height: number;
  animated: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR_WIDTH_OFFSET = 16;
const PNG_FIRST_CHUNK_OFFSET = 8;
const PNG_CHUNK_OVERHEAD = 12; // length + type + CRC

const GIF_SCREEN_WIDTH_OFFSET = 6;
const GIF_HEADER_SIZE = 13;
const GIF_COLOR_TABLE_FLAG = 0x80;
const GIF_COLOR_TABLE_SIZE_MASK = 0x07;
const GIF_EXTENSION = 0x21;
const GIF_IMAGE_DESCRIPTOR = 0x2c;
const GIF_TRAILER = 0x3b;
const GIF_IMAGE_DESCRIPTOR_SIZE = 10;

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

const WEBP_CHUNK_OFFSET = 12;
const WEBP_VP8X_ANIMATION_FLAG = 0x02;
const WEBP_14_BIT_MASK = 0x3fff;

const ascii = (buffer: Buffer, offset: number, length: number): string =>
  buffer.toString('latin1', offset, offset + length);

function parsePng(buffer: Buffer): ImageInfo | null {
  if (buffer.length < PNG_IHDR_WIDTH_OFFSET + 8) return null;
  if (!PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) return null;
  const width = buffer.readUInt32BE(PNG_IHDR_WIDTH_OFFSET);
  const height = buffer.readUInt32BE(PNG_IHDR_WIDTH_OFFSET + 4);

  // APNG: an acTL chunk appears before the first IDAT
  let animated = false;
  let offset = PNG_FIRST_CHUNK_OFFSET;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = ascii(buffer, offset + 4, 4);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT' || type === 'IEND') break;
    offset += length + PNG_CHUNK_OVERHEAD;
  }
  return { width, height, animated };
}

function skipGifSubBlocks(buffer: Buffer, start: number): number {
  let offset = start;
  while (offset < buffer.length) {
    const size = buffer[offset] ?? 0;
    offset += 1;
    if (size === 0) return offset;
    offset += size;
  }
  return offset;
}

function parseGif(buffer: Buffer): ImageInfo | null {
  if (buffer.length < GIF_HEADER_SIZE || !ascii(buffer, 0, 3).startsWith('GIF')) return null;
  const width = buffer.readUInt16LE(GIF_SCREEN_WIDTH_OFFSET);
  const height = buffer.readUInt16LE(GIF_SCREEN_WIDTH_OFFSET + 2);
  const packed = buffer[10] ?? 0;
  let offset = GIF_HEADER_SIZE;
  if (packed & GIF_COLOR_TABLE_FLAG) offset += 3 * 2 ** ((packed & GIF_COLOR_TABLE_SIZE_MASK) + 1);

  let frames = 0;
  while (offset < buffer.length && frames < 2) {
    const blockType = buffer[offset];
    if (blockType === GIF_TRAILER) break;
    if (blockType === GIF_EXTENSION) {
      offset = skipGifSubBlocks(buffer, offset + 2);
    } else if (blockType === GIF_IMAGE_DESCRIPTOR) {
      frames++;
      const localPacked = buffer[offset + 9] ?? 0;
      offset += GIF_IMAGE_DESCRIPTOR_SIZE;
      if (localPacked & GIF_COLOR_TABLE_FLAG)
        offset += 3 * 2 ** ((localPacked & GIF_COLOR_TABLE_SIZE_MASK) + 1);
      offset = skipGifSubBlocks(buffer, offset + 1); // +1: LZW minimum code size
    } else {
      break; // corrupt stream – keep what we know
    }
  }
  return { width, height, animated: frames > 1 };
}

function parseJpeg(buffer: Buffer): ImageInfo | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (JPEG_STANDALONE_MARKERS.has(marker)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 9 > buffer.length) return null;
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        animated: false,
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

const readUInt24LE = (buffer: Buffer, offset: number): number =>
  (buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8) | ((buffer[offset + 2] ?? 0) << 16);

function parseWebp(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 30 || ascii(buffer, 0, 4) !== 'RIFF' || ascii(buffer, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(buffer, WEBP_CHUNK_OFFSET, 4);
  const data = WEBP_CHUNK_OFFSET + 8;
  if (chunk === 'VP8X') {
    const flags = buffer[data] ?? 0;
    return {
      width: readUInt24LE(buffer, data + 4) + 1,
      height: readUInt24LE(buffer, data + 7) + 1,
      animated: (flags & WEBP_VP8X_ANIMATION_FLAG) !== 0,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(data + 6) & WEBP_14_BIT_MASK,
      height: buffer.readUInt16LE(data + 8) & WEBP_14_BIT_MASK,
      animated: false,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(data + 1);
    return {
      width: (bits & WEBP_14_BIT_MASK) + 1,
      height: ((bits >> 14) & WEBP_14_BIT_MASK) + 1,
      animated: false,
    };
  }
  return null;
}

/** Detects the format from content (not the extension) and reads its header. */
export function readImageInfo(buffer: Buffer): ImageInfo | null {
  try {
    return parsePng(buffer) ?? parseGif(buffer) ?? parseJpeg(buffer) ?? parseWebp(buffer);
  } catch {
    return null; // RangeError on truncated files
  }
}
