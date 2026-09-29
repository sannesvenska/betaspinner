import { describe, expect, it } from 'vitest';
import { readImageInfo } from './imageHeader';
import { gifFile, jpegHeader, pngHeader, webpVp8xHeader } from './testImages';

describe('readImageInfo', () => {
  it('reads PNG dimensions and detects APNG', () => {
    expect(readImageInfo(pngHeader(640, 480))).toEqual({ width: 640, height: 480, animated: false });
    expect(readImageInfo(pngHeader(10, 20, true))).toEqual({ width: 10, height: 20, animated: true });
  });

  it('reads GIF dimensions and counts frames', () => {
    expect(readImageInfo(gifFile(32, 16, 1))).toEqual({ width: 32, height: 16, animated: false });
    expect(readImageInfo(gifFile(32, 16, 3))).toEqual({ width: 32, height: 16, animated: true });
  });

  it('reads JPEG dimensions from the SOF segment', () => {
    expect(readImageInfo(jpegHeader(1920, 1080))).toEqual({ width: 1920, height: 1080, animated: false });
  });

  it('reads WebP VP8X dimensions and animation flag', () => {
    expect(readImageInfo(webpVp8xHeader(800, 600, false))).toEqual({
      width: 800,
      height: 600,
      animated: false,
    });
    expect(readImageInfo(webpVp8xHeader(800, 600, true))?.animated).toBe(true);
  });

  it('returns null for unknown or truncated data', () => {
    expect(readImageInfo(Buffer.from('not an image'))).toBeNull();
    expect(readImageInfo(jpegHeader(10, 10).subarray(0, 12))).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
  });
});
