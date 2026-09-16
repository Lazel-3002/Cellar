import { useEffect, useState } from 'react';
import type { DesignTheme } from '@shared/types/design';

/**
 * Inline visuals have to look like they were drawn by the app, not pasted into it: the same text
 * color, the same font, the same background showing through. Everything here is read from the
 * live CSS variables so a chart, an SVG and a sandboxed frame all agree — and all follow the
 * theme and accent when the user changes them.
 */
export interface VizTheme {
  dark: boolean;
  background: string;
  foreground: string;
  muted: string;
  faint: string;
  divider: string;
  brand: string;
  font: string;
  /** Categorical series colors, tuned for the current background. */
  palette: string[];
}

/** Series colors: distinct, readable on cream, and lifted a little for the dark theme. */
const LIGHT_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#8b5cf6', '#d9488a', '#0e9bb0', '#7c9885'];
const DARK_PALETTE = ['#5b9bf0', '#f4834f', '#33c793', '#f0b429', '#a78bfa', '#f062a3', '#2bb8cd', '#93ad95'];

export function readVizTheme(): VizTheme {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const dark = root.dataset.theme !== 'light';
  const css = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    dark,
    background: css('--background', dark ? '#151515' : '#faf9f5'),
    foreground: css('--foreground', dark ? '#f0efec' : '#141413'),
    muted: css('--muted-foreground', dark ? '#898781' : '#73726c'),
    faint: css('--faint', dark ? '#4b4a47' : '#b9b6ab'),
    divider: css('--divider', dark ? '#292929' : '#e6e3d9'),
    brand: css('--brand', '#d97757'),
    font: css('--chat-font', "'Source Serif 4 Variable', Georgia, serif"),
    palette: dark ? DARK_PALETTE : LIGHT_PALETTE,
  };
}

/** The visualization palette, kept in step with the theme, accent and chat font. */
export function useVizTheme(): VizTheme {
  const [theme, setTheme] = useState(readVizTheme);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme((prev) => {
        const next = readVizTheme();
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      }),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * The chat dressed up as a design theme, so `chartSvg` — written for the Design page — draws
 * chat charts without knowing anything about the chat.
 */
export function chartTheme(theme: VizTheme): DesignTheme {
  return {
    id: 'chat',
    name: 'Chat',
    colors: {
      background: theme.background,
      surface: theme.background,
      text: theme.foreground,
      muted: theme.muted,
      primary: theme.palette[0],
      secondary: theme.palette[2],
      accent: theme.palette[1],
    },
    fonts: { heading: 'Inter', body: 'Inter' },
  };
}

/** Sans, not the serif chat font: axis labels and legends read better and match Claude's charts. */
export const VIZ_FONT_STACK = "'Inter Variable', 'Segoe UI', system-ui, sans-serif";

/**
 * CSS custom properties handed to a sandboxed `html viz` document. The names are the ones models
 * reach for on their own (`--text-secondary`, `--border`), so a fragment written blind still
 * lands on the right colors.
 */
export function vizCssVariables(theme: VizTheme): Record<string, string> {
  return {
    '--background': theme.background,
    '--bg': theme.background,
    '--surface': theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,20,19,0.03)',
    '--text-primary': theme.foreground,
    '--text': theme.foreground,
    '--foreground': theme.foreground,
    '--text-secondary': theme.muted,
    '--muted': theme.muted,
    '--text-muted': theme.faint,
    '--border': theme.divider,
    '--divider': theme.divider,
    '--accent': theme.brand,
    '--brand': theme.brand,
    '--font-sans': VIZ_FONT_STACK,
    '--font-serif': theme.font,
    ...Object.fromEntries(theme.palette.map((color, i) => [`--chart-${i + 1}`, color])),
  };
}
