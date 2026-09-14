import type { ComponentType, SVGProps } from 'react';
import {
  Brain,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FilePen,
  FilePlus,
  FileText,
  FolderOpen,
  Globe,
  Hand,
  History,
  ListTodo,
  Map as MapIcon,
  Plug,
  Presentation,
  Search,
  Sheet,
  Sparkles,
  SquareTerminal,
  Stethoscope,
  TextSearch,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ConversationKind, PermissionMode, ToolPart } from '@shared/types/agent';

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

export const PERMISSION_MODES: Record<PermissionMode, { label: string; short: string; description: string; icon: Icon }> = {
  ask: { label: 'Ask before changes', short: 'Ask', description: 'Approve each file change and command before it runs.', icon: Hand },
  'auto-edits': { label: 'Auto-accept edits', short: 'Auto-accept edits', description: 'Changes inside the folder happen right away. Commands still ask.', icon: Zap },
  plan: { label: 'Plan only', short: 'Plan only', description: 'Look around and propose a plan without changing anything.', icon: MapIcon },
};

export const conversationRoute = (kind: ConversationKind) =>
  kind === 'code' ? ('/code/$conversationId' as const) : kind === 'task' ? ('/task/$conversationId' as const) : ('/chat/$conversationId' as const);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function short(value: string, max = 64): string {
  const line = value.split('\n').find((l) => l.trim())?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface ToolDescription {
  icon: Icon;
  done: string;
  active: string;
  failed: string;
  /** The file, pattern, command or page the step is about. */
  target?: string;
}

const DOCUMENT_TOOLS: Record<string, Icon> = { create_docx: FileText, create_xlsx: Sheet, create_pptx: Presentation, create_pdf: FileText };

export function describeTool(part: Pick<ToolPart, 'name' | 'args' | 'connector'>): ToolDescription {
  const args = part.args ?? {};
  const path = text(args.path);
  if (part.connector) return { icon: Plug, done: `Used ${part.connector.name}:`, active: `Using ${part.connector.name}:`, failed: `${part.connector.name} failed:`, target: part.connector.tool };
  switch (part.name) {
    case 'list_dir':
      return { icon: FolderOpen, done: 'Listed', active: 'Listing', failed: "Couldn't list", target: !path || path === '.' ? 'the working folder' : path };
    case 'read_file':
      return { icon: FileText, done: 'Read', active: 'Reading', failed: "Couldn't read", target: path };
    case 'glob':
      return { icon: Search, done: 'Found files matching', active: 'Finding files matching', failed: "Couldn't search for", target: text(args.pattern) };
    case 'grep':
      return { icon: TextSearch, done: 'Searched files for', active: 'Searching files for', failed: "Couldn't search for", target: text(args.pattern) };
    case 'write_file':
      return { icon: FilePlus, done: 'Wrote', active: 'Writing', failed: "Couldn't write", target: path };
    case 'edit_file':
      return { icon: FilePen, done: 'Edited', active: 'Editing', failed: "Couldn't edit", target: path };
    case 'create_docx':
    case 'create_xlsx':
    case 'create_pptx':
    case 'create_pdf': {
      const ext = part.name.slice(7);
      const target = path && !path.toLowerCase().endsWith(`.${ext}`) ? `${path}.${ext}` : path;
      return { icon: DOCUMENT_TOOLS[part.name], done: 'Created', active: 'Creating', failed: "Couldn't create", target };
    }
    case 'run_command':
      return { icon: SquareTerminal, done: 'Ran', active: 'Running', failed: 'Command failed:', target: short(text(args.command), 72) };
    case 'web_search':
      return { icon: Globe, done: 'Searched the web for', active: 'Searching the web for', failed: 'Web search failed for', target: text(args.query) };
    case 'web_fetch':
      return { icon: Globe, done: 'Read', active: 'Opening', failed: "Couldn't open", target: short(text(args.url).replace(/^https?:\/\/(www\.)?/, ''), 60) };
    case 'todo_write':
      return { icon: ListTodo, done: 'Updated the plan', active: 'Updating the plan', failed: "Couldn't update the plan" };
    case 'get_diagnostics':
      return { icon: Stethoscope, done: 'Checked for problems in', active: 'Checking for problems in', failed: "Couldn't check", target: path || 'the project' };
    case 'skill':
      return { icon: Sparkles, done: 'Loaded the skill', active: 'Loading the skill', failed: "Couldn't load the skill", target: text(args.name) };
    case 'read_skill_file':
      return { icon: Sparkles, done: 'Read', active: 'Reading', failed: "Couldn't read", target: `${text(args.skill)}/${path}` };
    case 'remember':
      return { icon: Brain, done: 'Remembered', active: 'Remembering', failed: "Couldn't remember", target: short(text(args.content), 60) };
    case 'forget':
      return { icon: Brain, done: 'Forgot', active: 'Forgetting', failed: "Couldn't forget", target: short(text(args.memory), 60) };
    case 'search_chats':
      return { icon: History, done: 'Searched past chats for', active: 'Searching past chats for', failed: "Couldn't search past chats for", target: text(args.query) };
    case 'read_chat':
      return { icon: History, done: 'Read an earlier chat', active: 'Reading an earlier chat', failed: "Couldn't read the chat" };
    default: {
      const connector = /^(.+?)__(.+)$/.exec(part.name);
      if (connector) return { icon: Plug, done: `Used ${connector[1]}:`, active: `Using ${connector[1]}:`, failed: `${connector[1]} failed:`, target: connector[2] };
      return { icon: Wrench, done: 'Used', active: 'Using', failed: "Couldn't use", target: part.name };
    }
  }
}

export function fileIcon(path: string): Icon {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return FileImage;
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return Sheet;
  if (['pptx', 'ppt'].includes(ext)) return Presentation;
  if (['md', 'txt', 'docx', 'doc', 'pdf', 'rtf'].includes(ext)) return FileText;
  if (['zip', '7z', 'rar', 'gz', 'tar'].includes(ext)) return FileArchive;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css', 'ps1', 'sh', 'cs', 'java', 'go', 'rs', 'c', 'cpp', 'yaml', 'yml', 'xml', 'sql'].includes(ext)) return FileCode;
  return File;
}

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

/** Line diff (LCS) for the small replacements edit_file makes. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > 250_000) return [...a.map((t) => ({ type: 'del' as const, text: t })), ...b.map((t) => ({ type: 'add' as const, text: t }))];
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', text: a[i++] });
    } else {
      out.push({ type: 'add', text: b[j++] });
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
  return out;
}

export const IDEAS: Array<{ icon: Icon; label: string; prompt: string; needsFolder: boolean }> = [
  {
    icon: FileText,
    label: 'Summarize a folder of documents',
    prompt: 'Read the documents in this folder and write a summary.md with the key points of each one and the main themes across them.',
    needsFolder: true,
  },
  {
    icon: FolderOpen,
    label: 'Organize my downloads folder',
    prompt: 'Look through this folder and propose a tidy structure (by type and date). Then move the files into subfolders, and write a short log of what moved where.',
    needsFolder: true,
  },
  {
    icon: Presentation,
    label: 'Turn my notes into a presentation',
    prompt: 'Read my notes in this folder and turn them into a clear slide deck (presentation.pptx) with a title slide and 6–10 content slides with speaker notes.',
    needsFolder: true,
  },
  {
    icon: Globe,
    label: 'Research a topic and write a report',
    prompt: 'Research the following topic on the web, compare a few good sources, and write a well-structured report as report.docx with a sources section: ',
    needsFolder: false,
  },
];
