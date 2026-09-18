import raw from '../../../../docs/CHANGELOG.md?raw';

export interface ChangelogSection {
  label: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  tagline?: string;
  sections: ChangelogSection[];
}

function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;

  for (const line of text.split('\n')) {
    const version = /^## (\S+) — (\d{4}-\d{2}-\d{2})/.exec(line);
    if (version) {
      entry = { version: version[1], date: version[2], sections: [] };
      entries.push(entry);
      section = null;
      continue;
    }
    if (!entry) continue;
    const tagline = /^\*\*(.+)\*\*/.exec(line);
    if (tagline) {
      entry.tagline = tagline[1];
      continue;
    }
    const heading = /^### (.+)/.exec(line);
    if (heading) {
      section = { label: heading[1], items: [] };
      entry.sections.push(section);
      continue;
    }
    const item = /^- (.+)/.exec(line);
    if (item && section) section.items.push(item[1]);
  }
  return entries;
}

export const CHANGELOG: ChangelogEntry[] = parseChangelog(raw);
