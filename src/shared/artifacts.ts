import type { ArtifactType } from './types/chat';

export interface ParsedArtifact {
  identifier: string;
  type: ArtifactType;
  title: string;
  language: string;
  content: string;
  /** True when the closing fence has not arrived yet (still streaming). */
  open: boolean;
  /** Character offsets of the whole fenced block in the source text. */
  start: number;
  end: number;
}

const LANGUAGE_TYPES: Record<string, ArtifactType> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  jsx: 'react',
  tsx: 'react',
  react: 'react',
  mermaid: 'mermaid',
  md: 'markdown',
  markdown: 'markdown',
};

export function artifactTypeFor(language: string): ArtifactType {
  return LANGUAGE_TYPES[language.toLowerCase()] ?? 'code';
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'artifact'
  );
}

const TYPE_TITLES: Record<ArtifactType, string> = {
  html: 'Web page',
  svg: 'SVG image',
  react: 'React component',
  mermaid: 'Diagram',
  markdown: 'Document',
  code: 'Code',
};

/** A readable title when the model did not supply one: <title>, first heading, or component name. */
export function deriveArtifactTitle(type: ArtifactType, content: string): string {
  const clean = (s?: string) => s?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (type === 'html' || type === 'svg') {
    const title = clean(content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || clean(content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
    if (title) return title;
  }
  if (type === 'markdown') {
    const heading = clean(content.match(/^#{1,3}\s+(.+)$/m)?.[1]);
    if (heading) return heading;
  }
  if (type === 'react') {
    const name = content.match(/export\s+default\s+(?:function\s+)?([A-Z]\w*)/)?.[1];
    if (name && name !== 'App') return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }
  return TYPE_TITLES[type];
}

export function parseInfoString(info: string): { language: string; isArtifact: boolean; title?: string; id?: string } {
  const trimmed = info.trim();
  const language = trimmed.split(/\s+/)[0]?.replace(/^artifact:/i, '') ?? '';
  const isArtifact = /(^|\s)artifact(\s|$|:)/i.test(trimmed) || /^artifact:/i.test(trimmed);
  const attr = (name: string) => trimmed.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'i'));
  const title = attr('title');
  const id = attr('id');
  return {
    language: language.toLowerCase() === 'artifact' ? '' : language,
    isArtifact,
    title: title ? title[1] ?? title[2] ?? title[3] : undefined,
    id: id ? id[1] ?? id[2] ?? id[3] : undefined,
  };
}

/**
 * Find fenced code blocks whose info string marks them as artifacts, e.g.
 * ```html artifact title="Pomodoro timer"
 */
export function parseArtifacts(markdown: string): ParsedArtifact[] {
  const out: ParsedArtifact[] = [];
  const lines = markdown.split('\n');
  let offset = 0;
  let i = 0;
  const lineStarts: number[] = [];
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  while (i < lines.length) {
    const open = lines[i].match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) {
      i++;
      continue;
    }
    const fence = open[1];
    const info = parseInfoString(open[2] ?? '');
    const close = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    const closed = j < lines.length;
    if (info.isArtifact) {
      const content = lines.slice(i + 1, j).join('\n');
      const type = artifactTypeFor(info.language);
      const title = info.title?.trim() || deriveArtifactTitle(type, content);
      // Without an explicit title or id the identifier must not depend on streamed content.
      const identifier = info.id ? slugify(info.id) : info.title?.trim() ? slugify(info.title) : `${type}-${out.length + 1}`;
      out.push({
        identifier,
        type,
        title,
        language: info.language,
        content,
        open: !closed,
        start: lineStarts[i],
        end: closed ? lineStarts[j] + lines[j].length : markdown.length,
      });
    }
    i = closed ? j + 1 : lines.length;
  }
  return out;
}
