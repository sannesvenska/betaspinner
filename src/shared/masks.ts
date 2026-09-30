/**
 * game-design §12 region masks. Coordinates are normalized 0..1 relative to the image's natural size,
 * so masks are independent of display size; they are keyed by the image's content hash.
 */

export type MaskShape = 'rect' | 'ellipse' | 'polygon';
export type MaskEffect = 'pixelate' | 'splatter';
export type MaskStatus = 'unreviewed' | 'masked' | 'no_regions';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MaskRegion {
  id: string;
  shape: MaskShape;
  /** rect and ellipse (bounding box) */
  rect?: Box;
  /** polygon (lasso strokes are simplified to polygons) */
  points?: Point[];
  effects: MaskEffect[];
  /** Edge feather as fraction of the image's short side, 0..MAX_FEATHER */
  feather: number;
}

export interface ImageMask {
  imageHash: string;
  status: MaskStatus;
  regions: MaskRegion[];
  updatedAt: string;
}

export const MASK_EFFECTS: readonly MaskEffect[] = ['pixelate', 'splatter'];
export const MAX_FEATHER = 0.1;
export const DEFAULT_FEATHER = 0.02;
/** Shapes smaller than this (normalized) are discarded as accidental clicks. */
export const MIN_REGION_SIZE = 0.01;
const MIN_POLYGON_POINTS = 3;
/** Lasso simplification tolerance (normalized, ≈ 0.4 % of the image). */
export const LASSO_EPSILON = 0.004;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// --- geometry ---

/** Box from two corner points (any drag direction), clamped to the image. */
export function boxFromPoints(a: Point, b: Point): Box {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function regionBounds(region: MaskRegion): Box {
  if (region.rect) return region.rect;
  const points = region.points ?? [];
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point;
    const b = polygon[j] as Point;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Is `point` inside the region? (ellipse by its equation, polygon by ray casting) */
export function hitTest(region: MaskRegion, point: Point): boolean {
  if (region.shape === 'polygon') return pointInPolygon(point, region.points ?? []);
  const box = region.rect;
  if (!box) return false;
  if (region.shape === 'rect')
    return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  const rx = box.w / 2;
  const ry = box.h / 2;
  if (rx === 0 || ry === 0) return false;
  const dx = (point.x - (box.x + rx)) / rx;
  const dy = (point.y - (box.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Topmost region under the point (last drawn wins), or undefined. */
export const regionAt = (regions: readonly MaskRegion[], point: Point): MaskRegion | undefined =>
  [...regions].reverse().find((region) => hitTest(region, point));

/** Moves a region; the shift is limited so the region stays inside the image. */
export function moveRegion(region: MaskRegion, dx: number, dy: number): MaskRegion {
  const bounds = regionBounds(region);
  const sx = Math.min(1 - (bounds.x + bounds.w), Math.max(-bounds.x, dx));
  const sy = Math.min(1 - (bounds.y + bounds.h), Math.max(-bounds.y, dy));
  if (region.rect)
    return { ...region, rect: { ...region.rect, x: region.rect.x + sx, y: region.rect.y + sy } };
  return { ...region, points: (region.points ?? []).map((point) => ({ x: point.x + sx, y: point.y + sy })) };
}

export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/** Drags one bounding-box corner to `point`; polygons are scaled with their bounding box. */
export function resizeRegion(region: MaskRegion, handle: Handle, point: Point): MaskRegion {
  const bounds = regionBounds(region);
  const fixed: Point = {
    x: handle.includes('w') ? bounds.x + bounds.w : bounds.x,
    y: handle.includes('n') ? bounds.y + bounds.h : bounds.y,
  };
  const next = boxFromPoints(fixed, point);
  const box: Box = { ...next, w: Math.max(MIN_REGION_SIZE, next.w), h: Math.max(MIN_REGION_SIZE, next.h) };
  if (region.shape !== 'polygon') return { ...region, rect: box };
  const scaleX = bounds.w === 0 ? 1 : box.w / bounds.w;
  const scaleY = bounds.h === 0 ? 1 : box.h / bounds.h;
  return {
    ...region,
    points: (region.points ?? []).map((p) => ({
      x: clamp01(box.x + (p.x - bounds.x) * scaleX),
      y: clamp01(box.y + (p.y - bounds.y) * scaleY),
    })),
  };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker simplification of a lasso stroke (§12.3). */
export function simplifyPath(points: readonly Point[], epsilon = LASSO_EPSILON): Point[] {
  if (points.length <= 2) return [...points];
  const first = points[0] as Point;
  const last = points[points.length - 1] as Point;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i] as Point, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= epsilon) return [first, last];
  const left = simplifyPath(points.slice(0, index + 1), epsilon);
  const right = simplifyPath(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** True when the region is big enough to keep (drag vs. click). */
export function isUsableRegion(region: MaskRegion): boolean {
  const bounds = regionBounds(region);
  if (region.shape === 'polygon' && (region.points?.length ?? 0) < MIN_POLYGON_POINTS) return false;
  return bounds.w >= MIN_REGION_SIZE && bounds.h >= MIN_REGION_SIZE;
}

/** Status follows the regions; "no regions" is only kept when explicitly chosen and still empty. */
export function statusFor(regions: readonly MaskRegion[], previous: MaskStatus): MaskStatus {
  if (regions.length > 0) return 'masked';
  return previous === 'no_regions' ? 'no_regions' : 'unreviewed';
}

/** Regions that restrict `effect`; undefined = the image is not masked (folder behaviour applies). */
export function regionsForEffect(mask: ImageMask | undefined, effect: MaskEffect): MaskRegion[] | undefined {
  if (mask?.status !== 'masked') return undefined;
  return mask.regions.filter((region) => region.effects.includes(effect));
}

// --- normalization (masks.json is data – never trust it blindly) ---

function normalizeRegion(value: unknown): MaskRegion | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  const effects = Array.isArray(value.effects)
    ? MASK_EFFECTS.filter((effect) => (value.effects as unknown[]).includes(effect))
    : [...MASK_EFFECTS];
  const feather = isNumber(value.feather)
    ? Math.min(MAX_FEATHER, Math.max(0, value.feather))
    : DEFAULT_FEATHER;
  if (value.shape === 'rect' || value.shape === 'ellipse') {
    const rect = isRecord(value.rect) ? value.rect : null;
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(isNumber)) return null;
    const box = boxFromPoints(
      { x: rect.x as number, y: rect.y as number },
      { x: (rect.x as number) + (rect.w as number), y: (rect.y as number) + (rect.h as number) },
    );
    return { id: value.id, shape: value.shape, rect: box, effects, feather };
  }
  if (value.shape === 'polygon' && Array.isArray(value.points)) {
    const points = value.points
      .filter((point): point is Point => isRecord(point) && isNumber(point.x) && isNumber(point.y))
      .map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }));
    return points.length >= MIN_POLYGON_POINTS
      ? { id: value.id, shape: 'polygon', points, effects, feather }
      : null;
  }
  return null;
}

export function normalizeMask(value: unknown): ImageMask | null {
  if (!isRecord(value) || typeof value.imageHash !== 'string' || !/^[0-9a-f]{40}$/.test(value.imageHash))
    return null;
  const regions = Array.isArray(value.regions)
    ? value.regions.map(normalizeRegion).filter((region): region is MaskRegion => region !== null)
    : [];
  const stored = value.status === 'no_regions' || value.status === 'masked' ? value.status : 'unreviewed';
  return {
    imageHash: value.imageHash,
    status: statusFor(regions, stored),
    regions,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
  };
}
