import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from './ipc';

export const FONTS_QUERY_KEY = ['design-fonts'];

/** Fonts imported into Cellar (a file or a Google Font). Shared by the font pickers and the importer, so any change to one refreshes the others. */
export function useFontsQuery() {
  return useQuery({ queryKey: FONTS_QUERY_KEY, queryFn: () => invoke('fonts:list') });
}

/** Injects `@font-face` rules for every imported font once, so the canvas and Inspector previews render them like any other font. Mount this once per window (Design's editor page). */
export function useCustomFonts(): void {
  const { data: fonts } = useFontsQuery();
  const families = (fonts ?? []).map((f) => f.family).join('␟');
  useEffect(() => {
    if (!families) return;
    let cancelled = false;
    void invoke('fonts:css', families.split('␟')).then((css) => {
      if (cancelled) return;
      let style = document.getElementById('cellar-custom-fonts') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'cellar-custom-fonts';
        document.head.appendChild(style);
      }
      style.textContent = css;
    });
    return () => {
      cancelled = true;
    };
  }, [families]);
}
