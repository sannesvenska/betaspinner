/**
 * Splatter overlays (game-design §12.4). Every image in assets/splatter/ is used – replace or add
 * files there (PNG with transparency or SVG) without touching code.
 */
const TEXTURE_URLS: string[] = Object.values(
  import.meta.glob<string>('../assets/splatter/*.{svg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);

let loading: Promise<HTMLImageElement[]> | null = null;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    // A broken texture is skipped, never fatal
    image.onerror = () => {
      resolve(null);
    };
    image.src = url;
  });
}

export function loadSplatterTextures(): Promise<HTMLImageElement[]> {
  loading ??= Promise.all(TEXTURE_URLS.map(loadImage)).then((images) =>
    images.filter((image): image is HTMLImageElement => image !== null),
  );
  return loading;
}
