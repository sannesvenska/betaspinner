import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { MEDIA_PROTOCOL } from '@shared/content';
import { parseRangeHeader } from './httpRange';

const HASH_PATTERN = /^[0-9a-f]{40}$/;

export interface ResolvedMedia {
  path: string;
  folderPath: string;
  mimeType: string;
}

/** Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      // corsEnabled: canvas effects and ImageDecoder read the media (no tainted canvas)
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ]);
}

const isInside = (folderPath: string, filePath: string): boolean => {
  const relation = relative(folderPath, filePath);
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation);
};

const textResponse = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain' } });

/**
 * Serves `bs-media://media/<hash>` – only files that are in the index of a registered folder.
 * No directory listing, no arbitrary paths (game-design §22).
 */
export function handleMediaProtocol(resolve: (hash: string) => ResolvedMedia | undefined): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    try {
      if (request.method !== 'GET') return textResponse(405, 'Method not allowed');
      const hash = new URL(request.url).pathname.replace(/^\//, '');
      if (!HASH_PATTERN.test(hash)) return textResponse(400, 'Bad media id');

      const media = resolve(hash);
      if (!media || !isInside(media.folderPath, media.path)) return textResponse(404, 'Not found');

      const { size } = await stat(media.path);
      const range = parseRangeHeader(request.headers.get('Range'), size);
      const baseHeaders = {
        'Content-Type': media.mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store', // privacy: no disk cache of media
        // Only the app itself can reach this scheme; allows canvas/ImageDecoder reads
        'Access-Control-Allow-Origin': '*',
      };

      if (range === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
        });
      }
      if (range) {
        const stream = createReadStream(media.path, { start: range.start, end: range.end });
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Length': String(range.end - range.start + 1),
            'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          },
        });
      }
      return new Response(Readable.toWeb(createReadStream(media.path)) as ReadableStream, {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(size) },
      });
    } catch (error) {
      console.error('[media] request failed', error);
      return textResponse(404, 'Not found');
    }
  });
}
