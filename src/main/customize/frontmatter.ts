/**
 * The small YAML subset used in SKILL.md and command frontmatter: `key: value`, quoted strings,
 * `|` / `>` block scalars, `[a, b]` and `- item` lists. Anything fancier is kept as raw text.
 */
export interface Frontmatter {
  data: Record<string, string | string[]>;
  body: string;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    const inner = v.slice(1, -1);
    return v.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
  }
  return v;
}

export function parseFrontmatter(text: string): Frontmatter {
  const source = text.replace(/^﻿/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2].replace(/\s+#.*$/, '').trim();
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].trim());
      data[key] = rest.startsWith('|') ? block.join('\n').trim() : block.join(' ').replace(/\s+/g, ' ').trim();
    } else if (rest === '') {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s*-\s+/, '')));
      if (items.length) {
        data[key] = items;
      } else {
        // A plain scalar folded over indented lines.
        const block: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
        data[key] = block.join(' ');
      }
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      data[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s))
        .filter(Boolean);
    } else {
      let value = kv[2].trim();
      // Unquoted scalars may continue on indented lines.
      while (!/^["']/.test(value) && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s*-\s/.test(lines[i + 1])) value += ` ${lines[++i].trim()}`;
      data[key] = unquote(value);
    }
  }
  return { data, body: source.slice(match[0].length) };
}

export const fmString = (data: Record<string, string | string[]>, key: string): string => {
  const value = data[key];
  return Array.isArray(value) ? value.join(', ') : (value ?? '').trim();
};

/** YAML-safe scalar for writing frontmatter. */
export function yamlString(value: string): string {
  const single = value.replace(/\s*\n\s*/g, ' ').trim();
  return /^[\w .,()/'-]*$/.test(single) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(single) && single !== '' ? single : JSON.stringify(single);
}
