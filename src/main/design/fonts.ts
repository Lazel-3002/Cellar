import type { FontSummary } from '@shared/types/design';
import { all, get, run } from '../db/client';
import { newId } from '../lib/util';

interface FontRow {
  id: string;
  family: string;
  source: 'upload' | 'google';
  mime: string;
  data: Uint8Array;
  size: number;
  created_at: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

/** Font MIME from the file's magic bytes; null when it isn't a font Cellar recognizes. */
function sniffFont(bytes: Buffer): string | null {
  if (bytes.length < 4) return null;
  const head = bytes.toString('latin1', 0, 4);
  if (head === 'OTTO') return 'font/otf';
  if (head === 'wOFF') return 'font/woff';
  if (head === 'wOF2') return 'font/woff2';
  if (head === '\x00\x01\x00\x00' || head === 'true' || head === 'ttcf') return 'font/ttf';
  return null;
}

const FORMATS: Record<string, string> = { 'font/otf': 'opentype', 'font/ttf': 'truetype', 'font/woff': 'woff', 'font/woff2': 'woff2' };

function toSummary(row: Pick<FontRow, 'id' | 'family' | 'source' | 'size' | 'created_at'>): FontSummary {
  return { id: row.id, family: row.family, source: row.source, size: row.size, createdAt: row.created_at };
}

/** Every imported font, newest first. */
export function listFonts(): FontSummary[] {
  return all<FontRow>('SELECT id, family, source, size, created_at FROM fonts ORDER BY created_at DESC').map(toSummary);
}

/** Adds a font file (.ttf/.otf/.woff/.woff2). The file name (minus its extension) becomes the family name typed into font pickers. */
export function addFontFile(fileName: string, bytes: Buffer): FontSummary {
  if (bytes.length > MAX_BYTES) throw new Error('That font file is too large (20 MB max).');
  const mime = sniffFont(bytes);
  if (!mime) throw new Error('That does not look like a font file (.ttf, .otf, .woff or .woff2).');
  const family = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60) || 'Untitled font';
  if (get('SELECT 1 FROM fonts WHERE family = ?', family)) throw new Error(`A font named "${family}" is already imported.`);
  const id = newId();
  run('INSERT INTO fonts (id, family, source, source_ref, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, family, 'upload', fileName, mime, bytes, bytes.length, Date.now());
  return { id, family, source: 'upload', size: bytes.length, createdAt: Date.now() };
}

/** Downloads a Google Font's regular weight and imports it under its own family name. */
export async function addGoogleFont(family: string): Promise<FontSummary> {
  const name = family.trim().slice(0, 60);
  if (!name) throw new Error('Give a Google Font name, e.g. "Inter" or "Roboto Slab".');
  if (get('SELECT 1 FROM fonts WHERE family = ?', name)) throw new Error(`A font named "${name}" is already imported.`);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400&display=swap`;
  // A modern desktop user agent is required for Google to serve woff2 instead of legacy formats.
  const cssRes = await fetch(cssUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } });
  if (!cssRes.ok) throw new Error(`"${name}" was not found on Google Fonts.`);
  const css = await cssRes.text();
  const fontUrl = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i.exec(css)?.[1];
  if (!fontUrl) throw new Error(`Could not find a downloadable file for "${name}".`);
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) throw new Error(`Could not download "${name}" from Google Fonts.`);
  const bytes = Buffer.from(await fontRes.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('That font file is too large (20 MB max).');
  const id = newId();
  run('INSERT INTO fonts (id, family, source, source_ref, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, name, 'google', name, 'font/woff2', bytes, bytes.length, Date.now());
  return { id, family: name, source: 'google', size: bytes.length, createdAt: Date.now() };
}

export function removeFont(id: string): void {
  const { changes } = run('DELETE FROM fonts WHERE id = ?', id);
  if (changes === 0) throw new Error('That font is gone.');
}

/** `@font-face` rules (as data URLs) for exactly the given family names, skipping anything not actually imported. */
export function fontFaceCss(families: Iterable<string>): string {
  const wanted = [...new Set(families)].filter(Boolean);
  if (wanted.length === 0) return '';
  const placeholders = wanted.map(() => '?').join(',');
  const rows = all<FontRow>(`SELECT family, mime, data FROM fonts WHERE family IN (${placeholders})`, ...wanted);
  return rows
    .map((row) => {
      const bytes = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      const format = FORMATS[row.mime] ?? 'woff2';
      return `@font-face{font-family:'${row.family.replace(/['\\]/g, '')}';src:url(data:${row.mime};base64,${bytes.toString('base64')}) format('${format}')}`;
    })
    .join('');
}
