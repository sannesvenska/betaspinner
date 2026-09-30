/**
 * Generates the placeholder splatter textures (game-design §12.4) as SVG files.
 * Replace them with your own PNG/SVG files in src/renderer/src/assets/splatter/ at any time –
 * every image in that folder is picked up automatically.
 * Run: node scripts/generate-splatter.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng, type Rng } from '../src/shared/session/rng.ts';

const OUTPUT_DIR = 'src/renderer/src/assets/splatter';
const TEXTURE_COUNT = 5;
const SIZE = 512;
const CENTER = SIZE / 2;
const BLOB_POINTS = 28;
const COLOR = '#efe8dc';
const OPACITY = 0.88;

const between = (rng: Rng, min: number, max: number): number => min + rng.next() * (max - min);

/** Closed smooth blob through jittered polar points (Catmull-Rom → cubic Bézier). */
function blobPath(rng: Rng, cx: number, cy: number, radius: number, jitter: number): string {
  const points = Array.from({ length: BLOB_POINTS }, (_, index) => {
    const angle = (index / BLOB_POINTS) * Math.PI * 2;
    const r = radius * between(rng, 1 - jitter, 1 + jitter);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const;
  });
  const at = (index: number) => points[(index + points.length) % points.length] as readonly [number, number];
  let path = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0]?.toFixed(1)} ${c1[1]?.toFixed(1)} ${c2[0]?.toFixed(1)} ${c2[1]?.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${path} Z`;
}

function texture(seed: number): string {
  const rng = createRng(seed);
  const shapes: string[] = [];
  const mainRadius = between(rng, 110, 150);
  shapes.push(`<path d="${blobPath(rng, CENTER, CENTER, mainRadius, 0.28)}"/>`);

  // Drips running down from the main blob
  const drips = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < drips; i++) {
    const x = CENTER + between(rng, -mainRadius * 0.7, mainRadius * 0.7);
    const top = CENTER + mainRadius * 0.4;
    const length = between(rng, 60, 180);
    const width = between(rng, 10, 22);
    shapes.push(
      `<rect x="${(x - width / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${length.toFixed(1)}" rx="${(width / 2).toFixed(1)}"/>`,
    );
    shapes.push(
      `<circle cx="${x.toFixed(1)}" cy="${(top + length).toFixed(1)}" r="${(width * 0.75).toFixed(1)}"/>`,
    );
  }

  // Satellite droplets around it
  const droplets = 8 + Math.floor(rng.next() * 10);
  for (let i = 0; i < droplets; i++) {
    const angle = rng.next() * Math.PI * 2;
    const distance = between(rng, mainRadius * 1.1, CENTER * 0.95);
    const radius = between(rng, 4, 22);
    shapes.push(
      `<path d="${blobPath(rng, CENTER + Math.cos(angle) * distance, CENTER + Math.sin(angle) * distance, radius, 0.2)}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <g fill="${COLOR}" opacity="${OPACITY}">
    ${shapes.join('\n    ')}
  </g>
</svg>
`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
for (let index = 1; index <= TEXTURE_COUNT; index++) {
  const file = join(OUTPUT_DIR, `splatter-${index}.svg`);
  writeFileSync(file, texture(index * 7919));
  console.log(`wrote ${file}`);
}
