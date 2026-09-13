import { copyFile, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { AttachmentKind, AttachmentRef } from '@shared/types/chat';
import { all, get, run } from '../db/client';
import { newId } from '../lib/util';
import type { ProviderMessage } from '../providers/types';
import { paths } from '../system/paths';
import { estimateTokens } from './context-window';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const TEXT_EXTENSIONS = new Set(
  (
    'txt md markdown mdx json jsonl csv tsv xml yaml yml toml ini cfg conf log env py js mjs cjs ts tsx jsx html htm css scss sass less ' +
    'c cc cpp cxx h hpp cs java kt kts go rs rb php sh bash zsh ps1 psm1 bat cmd sql r swift lua dart vue svelte tex rst gradle ' +
    'properties dockerfile makefile cmake proto graphql gql ipynb srt vtt'
  ).split(' '),
);

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

interface Row {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  path: string | null;
  text: string | null;
}

export function classifyFile(name: string, mime?: string): { kind: AttachmentKind; mime: string } | null {
  const ext = extname(name).slice(1).toLowerCase();
  if (IMAGE_TYPES[ext] || mime?.startsWith('image/')) return { kind: 'image', mime: IMAGE_TYPES[ext] ?? mime ?? 'image/png' };
  if (ext === 'pdf' || mime === 'application/pdf') return { kind: 'pdf', mime: 'application/pdf' };
  const lower = basename(name).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(lower) || mime?.startsWith('text/')) return { kind: 'text', mime: mime && mime !== 'application/octet-stream' ? mime : 'text/plain' };
  return null;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+\n/g, '\n').trim();
}

function toRef(row: Row): AttachmentRef {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    kind: row.kind,
    preview: row.text ? row.text.slice(0, 280) : undefined,
    tokens: row.text ? estimateTokens(row.text) : row.kind === 'image' ? 768 : undefined,
  };
}

async function store(name: string, bytes: Uint8Array, mimeHint?: string, sourcePath?: string): Promise<AttachmentRef> {
  const type = classifyFile(name, mimeHint);
  if (!type) throw new Error(`${name}: unsupported file type. Attach images, PDFs, or text/code files.`);
  const id = newId();
  let path: string | null = null;
  let text: string | null = null;
  if (type.kind === 'image') {
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`${name} is larger than 20 MB.`);
    const ext = extname(name) || '.png';
    path = join(paths().attachments, `${id}${ext.toLowerCase()}`);
    if (sourcePath) await copyFile(sourcePath, path);
    else await writeFile(path, bytes);
  } else if (type.kind === 'pdf') {
    text = await extractPdfText(bytes);
    if (!text) throw new Error(`${name}: no extractable text (scanned PDFs are not supported yet).`);
  } else {
    if (bytes.byteLength > MAX_TEXT_BYTES) throw new Error(`${name} is larger than 4 MB.`);
    text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').replace(/\u0000/g, '');
  }
  run('INSERT INTO attachments (id, name, mime, size, kind, path, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, name, type.mime, bytes.byteLength, type.kind, path, text, Date.now());
  return toRef({ id, name, mime: type.mime, size: bytes.byteLength, kind: type.kind, path, text });
}

export async function attachmentsFromPaths(filePaths: string[]): Promise<AttachmentRef[]> {
  const refs: AttachmentRef[] = [];
  for (const file of filePaths) {
    const info = await stat(file);
    if (!info.isFile()) continue;
    refs.push(await store(basename(file), await readFile(file), undefined, file));
  }
  return refs;
}

export function attachmentFromBytes(name: string, mime: string, bytes: Uint8Array): Promise<AttachmentRef> {
  return store(name, bytes, mime);
}

export function attachmentRefs(ids: string[]): AttachmentRef[] {
  if (ids.length === 0) return [];
  const rows = all<Row>(`SELECT id, name, mime, size, kind, path, text FROM attachments WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Row => !!r).map(toRef);
}

/** Expand a user turn's attachments into provider content: text inline, images as base64 when supported. */
export async function withAttachments(content: string, refs: AttachmentRef[], vision: boolean): Promise<Pick<ProviderMessage, 'content' | 'images'>> {
  if (refs.length === 0) return { content };
  const blocks: string[] = [];
  const images: NonNullable<ProviderMessage['images']> = [];
  for (const ref of refs) {
    const row = get<Row>('SELECT * FROM attachments WHERE id = ?', ref.id);
    if (!row) continue;
    if (row.kind === 'image') {
      if (vision && row.path) {
        try {
          images.push({ mime: row.mime, base64: (await readFile(row.path)).toString('base64') });
        } catch {
          blocks.push(`[Image "${row.name}" could not be read]`);
        }
      } else {
        blocks.push(`[The user attached an image named "${row.name}", but the current model cannot view images.]`);
      }
    } else if (row.text) {
      blocks.push(`<attachment name="${row.name.replace(/"/g, "'")}">\n${row.text}\n</attachment>`);
    }
  }
  return { content: blocks.length ? `${blocks.join('\n\n')}\n\n${content}` : content, images: images.length ? images : undefined };
}

export async function cleanupOrphanAttachments(): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const orphans = all<{ id: string; path: string | null }>(
    `SELECT a.id, a.path FROM attachments a
     WHERE a.created_at < ? AND NOT EXISTS (SELECT 1 FROM messages m WHERE instr(m.attachments, a.id) > 0)`,
    cutoff,
  );
  for (const o of orphans) {
    if (o.path) await rm(o.path, { force: true });
    run('DELETE FROM attachments WHERE id = ?', o.id);
  }
}
