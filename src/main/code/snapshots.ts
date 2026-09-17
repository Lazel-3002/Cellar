import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { paths } from '../system/paths';

/**
 * Original file contents saved before the agent first changes a file: Code sessions outside git,
 * and Cowork tasks (which never use git). They let a Changes panel show diffs and undo edits
 * without a repository.
 */
export interface SnapshotEntry {
  /** False when the agent created the file. */
  existed: boolean;
  /** Name of the saved copy inside the session's snapshot folder. */
  blob?: string;
  at: number;
}

export type SnapshotManifest = Record<string, SnapshotEntry>;

const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
const queues = new Map<string, Promise<unknown>>();

const folder = (conversationId: string) => join(paths().cellarHome, 'code', 'snapshots', conversationId.replace(/[^\w-]/g, ''));
const manifestPath = (conversationId: string) => join(folder(conversationId), 'manifest.json');
const toRel = (root: string, abs: string) => relative(root, abs).split(sep).join('/');

/** Run snapshot work for one session in order, so concurrent writes cannot lose manifest entries. */
function serial<T>(conversationId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(conversationId) ?? Promise.resolve();
  const next = previous.then(work, work);
  queues.set(
    conversationId,
    next.catch(() => undefined),
  );
  return next;
}

export async function readManifest(conversationId: string): Promise<SnapshotManifest> {
  try {
    return JSON.parse(await readFile(manifestPath(conversationId), 'utf8')) as SnapshotManifest;
  } catch {
    return {};
  }
}

async function writeManifest(conversationId: string, manifest: SnapshotManifest): Promise<void> {
  await mkdir(folder(conversationId), { recursive: true });
  await writeFile(manifestPath(conversationId), JSON.stringify(manifest), 'utf8');
}

/** Save a file's current state the first time the session is about to change it. */
export function snapshotBeforeChange(conversationId: string, root: string, abs: string): Promise<void> {
  return serial(conversationId, async () => {
    const rel = toRel(root, abs);
    const manifest = await readManifest(conversationId);
    if (manifest[rel]) return;
    const info = await stat(abs).catch(() => null);
    if (info && !info.isFile()) return;
    const entry: SnapshotEntry = { existed: !!info, at: Date.now() };
    if (info) {
      if (info.size > MAX_SNAPSHOT_BYTES) return;
      const blob = createHash('sha1').update(rel).digest('hex');
      await mkdir(folder(conversationId), { recursive: true });
      await writeFile(join(folder(conversationId), blob), await readFile(abs));
      entry.blob = blob;
    }
    manifest[rel] = entry;
    await writeManifest(conversationId, manifest);
  });
}

/** How a file looked before the session changed it; null when there is no snapshot. */
export async function snapshotOriginal(conversationId: string, rel: string): Promise<{ existed: boolean; content: Buffer | null } | null> {
  const entry = (await readManifest(conversationId))[rel];
  if (!entry) return null;
  if (!entry.existed || !entry.blob) return { existed: false, content: null };
  const content = await readFile(join(folder(conversationId), entry.blob)).catch(() => null);
  return { existed: true, content };
}

/** Drop a file's snapshot (after it was restored, or when it matches the original again). */
export function forgetSnapshot(conversationId: string, rel: string): Promise<void> {
  return serial(conversationId, async () => {
    const manifest = await readManifest(conversationId);
    const entry = manifest[rel];
    if (!entry) return;
    delete manifest[rel];
    if (entry.blob) await rm(join(folder(conversationId), entry.blob), { force: true });
    await writeManifest(conversationId, manifest);
  });
}

export async function deleteSnapshots(conversationId: string): Promise<void> {
  await rm(folder(conversationId), { recursive: true, force: true });
}
