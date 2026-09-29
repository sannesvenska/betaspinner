/** Synthetic image headers for tests (valid enough for the header parsers, not for decoders). */

export function pngHeader(width: number, height: number, animated = false): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  const parts = [signature, chunk('IHDR', ihdr)];
  if (animated) parts.push(chunk('acTL', Buffer.alloc(8)));
  parts.push(chunk('IDAT', Buffer.alloc(4)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

export function gifFile(width: number, height: number, frames: number): Buffer {
  const header = Buffer.alloc(13);
  header.write('GIF89a', 0, 'latin1');
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  header[10] = 0x80; // global color table, 2 entries
  const colorTable = Buffer.alloc(6);
  const graphicControl = Buffer.from([0x21, 0xf9, 0x04, 0, 0, 0, 0, 0]);
  const frame = Buffer.concat([
    Buffer.from([0x2c, 0, 0, 0, 0]),
    Buffer.from([width & 0xff, width >> 8, height & 0xff, height >> 8, 0]),
    Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]), // LZW min size, one sub-block, terminator
  ]);
  const body = Array.from({ length: frames }, () => Buffer.concat([graphicControl, frame]));
  return Buffer.concat([header, colorTable, ...body, Buffer.from([0x3b])]);
}

export function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from('JFIF\0', 'latin1'),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

export function webpVp8xHeader(width: number, height: number, animated: boolean): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'latin1');
  buffer.write('VP8X', 12, 'latin1');
  buffer.writeUInt32LE(10, 16);
  buffer[20] = animated ? 0x02 : 0;
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}
