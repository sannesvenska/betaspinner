import { useEffect, useRef, useState, type ReactNode } from 'react';

interface VirtualGridProps<T> {
  items: readonly T[];
  /** Minimum tile edge in px; columns fill the width */
  minTileSize: number;
  gap: number;
  itemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  label: string;
}

/** Rows rendered above and below the viewport. */
const OVERSCAN_ROWS = 3;

/**
 * Square-tile grid that only renders visible rows (game-design §22: grids must stay responsive with
 * thousands of files). Scrolls itself; fills its parent's height.
 */
export function VirtualGrid<T>({ items, minTileSize, gap, itemKey, renderItem, label }: VirtualGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const columns = Math.max(1, Math.floor((size.width + gap) / (minTileSize + gap)));
  const tile = size.width > 0 ? (size.width - gap * (columns - 1)) / columns : minTileSize;
  const rowHeight = tile + gap;
  const rows = Math.ceil(items.length / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + size.height) / rowHeight) + OVERSCAN_ROWS);
  const visible = items.slice(firstRow * columns, (lastRow + 1) * columns);

  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label={label}
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <div style={{ height: Math.max(0, rows * rowHeight - gap) }} className="relative">
        {visible.map((item, offset) => {
          const index = firstRow * columns + offset;
          return (
            <div
              key={itemKey(item)}
              role="listitem"
              className="absolute"
              style={{
                width: tile,
                height: tile,
                top: Math.floor(index / columns) * rowHeight,
                left: (index % columns) * (tile + gap),
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
