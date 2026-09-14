import type { Dirent } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ChangedFile, ChangeSet, FileContent, FileDiff, FileEntry } from '@shared/types/code';
import type { Workspace } from '../agent/workspace';
import { buildDiff } from './changes-git';
import { countLineChanges, countLines, decodeText, fileHasBom, isBinary, MAX_DIFF_BYTES, MAX_EDITOR_BYTES, readLimited } from './changes-text';
import { forgetSnapshot, readManifest, snapshotBeforeChange, snapshotOriginal } from './snapshots';

/**
 * Changes of a Code session outside git (from the snapshots saved before each first change), and
 * the file tree and editor of the Files pane.
 */

const BOM = String.fromCharCode(0xfeff);
/** Snapshots keep files up to 20 MB; compare current files up to that size. */
const MAX_COMPARE_BYTES = 20 * 1024 * 1024;

const byPath = (a: ChangedFile, b: ChangedFile) => a.path.localeCompare(b.path, 'en-US');
const countable = (buf: Buffer | null): buf is Buffer => !!buf && buf.length <= MAX_DIFF_BYTES;

export async function snapshotChangeSet(conversationId: string, workDir: string): Promise<ChangeSet> {
  const manifest = await readManifest(conversationId);
  const results = await Promise.all(
    Object.keys(manifest).map(async (path): Promise<ChangedFile | null> => {
      const [original, current] = await Promise.all([snapshotOriginal(conversationId, path), readLimited(join(workDir, path), MAX_COMPARE_BYTES)]);
      if (!original) return null;
      const exists = current.isFile;
      if (!original.existed && !exists) return null;
      const before = original.content;
      const after = current.content;
      const binary = (!!before && isBinary(before)) || (!!after && isBinary(after));
      if (!original.existed) {
        return { path, status: 'added', additions: countable(after) && !binary ? countLines(decodeText(after)) : 0, deletions: 0, binary };
      }
      if (!exists) {
        return { path, status: 'deleted', additions: 0, deletions: countable(before) && !binary ? countLines(decodeText(before)) : 0, binary };
      }
      if (before && after && before.equals(after)) return null;
      const counts = countable(before) && countable(after) && !binary ? countLineChanges(decodeText(before), decodeText(after)) : { additions: 0, deletions: 0 };
      return { path, status: 'modified', ...counts, binary };
    }),
  );
  const files = results.filter((f): f is ChangedFile => !!f).sort(byPath);
  return {
    source: 'snapshots',
    files,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    uncommitted: 0,
    commits: 0,
  };
}

export async function snapshotFileDiff(conversationId: string, workDir: string, rel: string): Promise<FileDiff> {
  const [original, current] = await Promise.all([snapshotOriginal(conversationId, rel), readLimited(join(workDir, rel), MAX_DIFF_BYTES)]);
  const afterTooLarge = current.isFile && !current.content;
  // Without a snapshot the file is unchanged, so both sides show its current content.
  if (!original) return buildDiff(rel, current.content, afterTooLarge, current.content, afterTooLarge);
  const beforeTooLarge = !!original.content && original.content.length > MAX_DIFF_BYTES;
  return buildDiff(rel, original.content, beforeTooLarge, current.content, afterTooLarge);
}

/** Restore a file from its snapshot (or delete it when the session created it). */
export async function snapshotDiscardFile(conversationId: string, workDir: string, rel: string): Promise<void> {
  const original = await snapshotOriginal(conversationId, rel);
  if (!original) throw new Error(`Cellar has no saved copy of ${rel}, so it cannot restore it.`);
  const abs = join(workDir, rel);
  if (original.existed) {
    if (!original.content) throw new Error(`The saved copy of ${rel} is missing, so it cannot be restored.`);
    const info = await stat(abs).catch(() => null);
    if (info?.isDirectory()) throw new Error(`${rel} is now a folder, so the file cannot be restored.`);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, original.content);
  } else {
    await rm(abs, { force: true });
  }
  await forgetSnapshot(conversationId, rel);
}

const MAX_ENTRIES = 2000;

/** One folder of the working folder: folders first, then files, by name. */
export async function listDirectory(workspace: Workspace, path: string): Promise<FileEntry[]> {
  const abs = await workspace.resolve(path);
  const rel = workspace.relative(abs);
  const info = await stat(abs).catch(() => null);
  if (!info) throw new Error(`${rel} does not exist.`);
  if (!info.isDirectory()) throw new Error(`${rel} is not a folder.`);
  let dirents: Dirent[];
  try {
    dirents = await readdir(abs, { withFileTypes: true });
  } catch {
    throw new Error(`${rel === '.' ? 'The working folder' : rel} cannot be read.`);
  }
  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== '.git')
      .map(async (d): Promise<FileEntry | null> => {
        const full = join(abs, d.name);
        const childRel = workspace.relative(full);
        if (d.isDirectory()) return { name: d.name, path: childRel, isDirectory: true };
        // Links (and junctions) are listed as what they point to.
        const s = d.isFile() ? null : await stat(full).catch(() => null);
        if (!d.isFile() && !s) return null;
        if (s?.isDirectory()) return { name: d.name, path: childRel, isDirectory: true };
        return { name: d.name, path: childRel, isDirectory: false };
      }),
  );
  const sorted = entries
    .filter((e): e is FileEntry => !!e)
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, 'en-US', { numeric: true }))
    .slice(0, MAX_ENTRIES);
  await Promise.all(
    sorted
      .filter((e) => !e.isDirectory)
      .map(async (e) => {
        const s = await stat(join(workspace.root, e.path)).catch(() => null);
        if (s) e.size = s.size;
      }),
  );
  return sorted;
}

export async function readWorkspaceFile(workspace: Workspace, path: string): Promise<FileContent> {
  const abs = await workspace.resolve(path);
  const rel = workspace.relative(abs);
  const read = await readLimited(abs, MAX_EDITOR_BYTES);
  if (!read.exists) throw new Error(`${rel} does not exist.`);
  if (!read.isFile) throw new Error(`${rel} is a folder.`);
  if (!read.content) return { path: rel, content: '', binary: false, tooLarge: true, size: read.size };
  if (isBinary(read.content)) return { path: rel, content: '', binary: true, tooLarge: false, size: read.size };
  return { path: rel, content: decodeText(read.content), binary: false, tooLarge: false, size: read.size };
}

export interface WriteOptions {
  /** Outside git: save the original first so the edit shows in Changes and can be discarded. */
  snapshotConversationId?: string;
}

/** Save a file from the editor, keeping a UTF-8 byte order mark the file already had. */
export async function writeWorkspaceFile(workspace: Workspace, path: string, content: string, options: WriteOptions = {}): Promise<void> {
  const abs = await workspace.resolve(path);
  const rel = workspace.relative(abs);
  if (rel === '.') throw new Error('Choose a file to save.');
  const info = await stat(abs).catch(() => null);
  if (info?.isDirectory()) throw new Error(`${rel} is a folder.`);
  if (options.snapshotConversationId) await snapshotBeforeChange(options.snapshotConversationId, workspace.root, abs);
  const bom = info ? await fileHasBom(abs) : false;
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bom ? BOM + content : content, 'utf8');
}
