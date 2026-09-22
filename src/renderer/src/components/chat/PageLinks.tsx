/**
 * Page citations in a reply — "(p. 12)", "pp. 45–48", "page 7", "sayfa 12", "s. 12" — as links that
 * turn the book to that page. Only inside Study, which provides where to go.
 */
import { createContext, useContext } from 'react';

export interface PageLinkTarget {
  pageCount: number;
  goTo: (page: number) => void;
}

export const PageLinkContext = createContext<PageLinkTarget | null>(null);

export const usePageLinks = () => useContext(PageLinkContext);

const CITATION = /\b(pp?\.|pages?|sayfa(?:lar)?|s\.)\s?(\d{1,4})(?:\s?[–-]\s?(\d{1,4}))?/gi;

/** Wraps citations in `<page-link>` elements, leaving code (fenced or inline) alone. */
export function withPageLinks(markdown: string, pageCount: number): string {
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(CITATION, (match: string, _word: string, from: string, to?: string) => {
        const page = Number(from);
        if (page < 1 || page > pageCount) return match;
        return `<page-link page="${page}"${to ? ` to="${Number(to)}"` : ''}>${match}</page-link>`;
      });
    })
    .join('');
}
