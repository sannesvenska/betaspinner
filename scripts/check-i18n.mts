/**
 * Reports translation keys used in the renderer but missing in a pack, and pack keys never used.
 * Static keys: t('a.b'), i18nKey="a.b". Dynamic keys: t(`action.${id}.name`) become the pattern
 * `action.*.name`; pack keys matching a dynamic pattern count as used.
 * Run: node scripts/check-i18n.mts  (exit code 1 on missing keys; unused keys only warn)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const RENDERER_DIR = 'src/renderer/src';
const LOCALES_DIR = join(RENDERER_DIR, 'i18n/locales');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const STATIC_KEY_PATTERNS = [/\bt\(\s*'([^']+)'/g, /\bt\(\s*"([^"]+)"/g, /i18nKey="([^"]+)"/g];
const DYNAMIC_KEY_PATTERN = /\bt\(\s*`([^`]+)`/g;
/** i18next plural suffixes resolved at runtime from a base key */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type JsonValue = string | { [key: string]: JsonValue };

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    const isSource = SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.endsWith('.test.ts');
    return isSource ? [path] : [];
  });
}

function flattenKeys(value: JsonValue, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function collectUsage(files: string[]): { staticKeys: Set<string>; dynamicPatterns: RegExp[] } {
  const staticKeys = new Set<string>();
  const dynamicPatterns: RegExp[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of STATIC_KEY_PATTERNS) {
      for (const match of source.matchAll(pattern)) if (match[1]) staticKeys.add(match[1]);
    }
    for (const match of source.matchAll(DYNAMIC_KEY_PATTERN)) {
      const template = match[1];
      if (!template) continue;
      const escaped = template
        .split(/\$\{[^}]+\}/)
        .map((part) => part.replace(/[.*+?^()|[\]\\]/g, '\\$&'))
        .join('[^.]+');
      dynamicPatterns.push(new RegExp(`^${escaped}$`));
    }
  }
  return { staticKeys, dynamicPatterns };
}

function checkPack(packFile: string, staticKeys: Set<string>, dynamicPatterns: RegExp[]): number {
  const pack = JSON.parse(readFileSync(join(LOCALES_DIR, packFile), 'utf8')) as JsonValue;
  const packKeys = new Set(flattenKeys(pack).map((key) => key.replace(PLURAL_SUFFIX, '')));

  const missing = [...staticKeys].filter((key) => !packKeys.has(key)).sort();
  const unused = [...packKeys]
    .filter((key) => !staticKeys.has(key) && !dynamicPatterns.some((pattern) => pattern.test(key)))
    .sort();

  for (const key of missing) console.error(`✗ ${packFile}: missing key "${key}"`);
  for (const key of unused) console.warn(`! ${packFile}: unused key "${key}"`);
  console.log(`${packFile}: ${packKeys.size} keys, ${missing.length} missing, ${unused.length} unused`);
  return missing.length;
}

const { staticKeys, dynamicPatterns } = collectUsage(listSourceFiles(RENDERER_DIR));
const packFiles = readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.json'));
const missingTotal = packFiles.reduce((sum, file) => sum + checkPack(file, staticKeys, dynamicPatterns), 0);
process.exitCode = missingTotal > 0 ? 1 : 0;
