import type * as MonacoApi from 'monaco-editor/editor/editor.api';

/**
 * Monaco, loaded on first use so it stays out of the main bundle. Only the editor worker is used:
 * syntax highlighting comes from Monaco's Monarch grammars, without the TypeScript, JSON, CSS or
 * HTML language services (and their large workers).
 */
export type Monaco = typeof MonacoApi;

export const EDITOR_FONT = '"Cascadia Mono", Consolas, monospace';
export const EDITOR_FONT_SIZE = 12.5;

let loading: Promise<Monaco> | null = null;
let loaded: Monaco | null = null;

export function loadMonaco(): Promise<Monaco> {
  if (!loading) {
    loading = load().then((monaco) => (loaded = monaco));
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Monaco if it has finished loading, so editors mounted later can skip the spinner. */
export const loadedMonaco = (): Monaco | null => loaded;

async function load(): Promise<Monaco> {
  const [{ default: EditorWorker }, monaco] = await Promise.all([
    import('monaco-editor/editor/editor.worker?worker'),
    import('monaco-editor/editor/editor.api'),
    import('monaco-editor/features/register.all'),
    import('monaco-editor/languages/definitions/register.all'),
  ]);
  // When a worker cannot start, Monaco computes diffs on the main thread instead.
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  registerJson(monaco);
  applyTheme(monaco);
  new MutationObserver(() => applyTheme(monaco)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
  return monaco;
}

/** Editor options shared by the code and diff editors. */
export const baseEditorOptions = {
  fontFamily: EDITOR_FONT,
  fontSize: EDITOR_FONT_SIZE,
  lineHeight: 19,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  fixedOverflowWidgets: true,
  renderLineHighlightOnlyWhenFocus: true,
  smoothScrolling: true,
  padding: { top: 6, bottom: 6 },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  stickyScroll: { enabled: false },
  guides: { indentation: true },
  // Monaco's own context menu renders inside the pane and matches the theme.
  contextmenu: true,
} satisfies MonacoApi.editor.IEditorOptions;

/* Themes */

function cssColor(probe: HTMLElement, name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw.slice(1).replace(/./g, (c) => c + c)}`.toLowerCase();
  if (!raw) return fallback;
  // Anything else (rgb(), named colors, color-mix()): let the browser resolve it.
  probe.style.color = '';
  probe.style.color = raw;
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
  return match ? `#${match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : fallback;
}

/** `#rrggbb` plus an alpha from 0 to 1. */
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

export const themeName = () => (document.documentElement.dataset.theme === 'light' ? 'cellar-light' : 'cellar-dark');

let lastThemeKey = '';

function applyTheme(monaco: Monaco): void {
  const dark = themeName() === 'cellar-dark';
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const c = (name: string, fallback: string) => cssColor(probe, name, fallback);
  const p = {
    background: c('--background', dark ? '#151515' : '#faf9f5'),
    foreground: c('--foreground', dark ? '#f0efec' : '#141413'),
    fg2: c('--fg-2', dark ? '#c3c2b7' : '#3d3d3a'),
    muted: c('--muted-foreground', dark ? '#898781' : '#73726c'),
    faint: c('--faint', dark ? '#4b4a47' : '#b9b6ab'),
    divider: c('--divider', dark ? '#292929' : '#e6e3d9'),
    hover: c('--hover', dark ? '#222221' : '#ebe8df'),
    selected: c('--selected', dark ? '#343434' : '#e4e1d6'),
    menu: c('--menu', dark ? '#232322' : '#ffffff'),
    menuBorder: c('--menu-border', dark ? '#383836' : '#e2dfd5'),
    composer: c('--composer', dark ? '#20201f' : '#ffffff'),
    composerBorder: c('--composer-border', dark ? '#373736' : '#dedbd0'),
    tile: c('--tile', dark ? '#454442' : '#d8d5ca'),
    code: c('--code', dark ? '#1b1b1a' : '#f3f1ea'),
    brand: c('--brand', '#d97757'),
    success: c('--success', dark ? '#5bb67a' : '#2f8a4d'),
    danger: c('--danger', dark ? '#ef6b52' : '#c8412b'),
    warning: c('--warning', dark ? '#e0a43a' : '#b7791f'),
  };
  probe.remove();
  const key = `${dark}:${Object.values(p).join(',')}`;
  if (key === lastThemeKey) return;
  lastThemeKey = key;

  monaco.editor.defineTheme(dark ? 'cellar-dark' : 'cellar-light', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: p.muted.slice(1), fontStyle: 'italic' }],
    colors: {
      'editor.background': p.background,
      'editor.foreground': p.foreground,
      'editorLineNumber.foreground': p.faint,
      'editorLineNumber.activeForeground': p.muted,
      'editor.lineHighlightBackground': alpha(p.hover, 0.7),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': alpha(p.brand, 0.3),
      'editor.inactiveSelectionBackground': alpha(p.brand, 0.16),
      'editor.selectionHighlightBackground': alpha(p.brand, 0.14),
      'editor.wordHighlightBackground': alpha(p.brand, 0.12),
      'editor.findMatchBackground': alpha(p.warning, 0.45),
      'editor.findMatchHighlightBackground': alpha(p.warning, 0.22),
      'editorCursor.foreground': p.brand,
      'editorIndentGuide.background1': p.divider,
      'editorIndentGuide.activeBackground1': p.tile,
      'editorWhitespace.foreground': p.faint,
      'editorBracketMatch.background': alpha(p.brand, 0.12),
      'editorBracketMatch.border': alpha(p.brand, 0.5),
      'editorGutter.background': p.background,
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': p.menu,
      'editorWidget.border': p.menuBorder,
      'editorWidget.foreground': p.foreground,
      'editorHoverWidget.background': p.menu,
      'editorHoverWidget.border': p.menuBorder,
      'editorSuggestWidget.background': p.menu,
      'editorSuggestWidget.border': p.menuBorder,
      'editorSuggestWidget.selectedBackground': p.selected,
      'editorStickyScroll.background': p.background,
      'widget.shadow': dark ? '#00000066' : '#0000001f',
      focusBorder: alpha(p.brand, 0.6),
      'input.background': p.composer,
      'input.border': p.composerBorder,
      'input.foreground': p.foreground,
      'inputOption.activeBorder': p.brand,
      'list.hoverBackground': p.hover,
      'list.activeSelectionBackground': p.selected,
      'list.activeSelectionForeground': p.foreground,
      'list.inactiveSelectionBackground': p.selected,
      'list.highlightForeground': p.brand,
      'quickInput.background': p.menu,
      'menu.background': p.menu,
      'menu.foreground': p.foreground,
      'menu.border': p.menuBorder,
      'menu.selectionBackground': p.hover,
      'menu.selectionForeground': p.foreground,
      'scrollbarSlider.background': alpha(p.tile, 0.55),
      'scrollbarSlider.hoverBackground': alpha(p.tile, 0.8),
      'scrollbarSlider.activeBackground': p.tile,
      'scrollbar.shadow': '#00000000',
      'diffEditor.insertedTextBackground': alpha(p.success, dark ? 0.22 : 0.18),
      'diffEditor.removedTextBackground': alpha(p.danger, dark ? 0.22 : 0.16),
      'diffEditor.insertedLineBackground': alpha(p.success, dark ? 0.1 : 0.08),
      'diffEditor.removedLineBackground': alpha(p.danger, dark ? 0.1 : 0.07),
      'diffEditorGutter.insertedLineBackground': alpha(p.success, 0.16),
      'diffEditorGutter.removedLineBackground': alpha(p.danger, 0.14),
      'diffEditor.border': p.divider,
      'diffEditor.diagonalFill': alpha(p.divider, 0.8),
      'diffEditor.unchangedRegionBackground': p.code,
      'diffEditor.unchangedRegionForeground': p.muted,
      'diffEditor.unchangedCodeBackground': alpha(p.code, 0.6),
    },
  });
  monaco.editor.setTheme(themeName());
}

/* Languages */

/** Extensions Monaco has no grammar for, mapped to the closest one it has. */
const EXTENSION_LANGUAGES: Record<string, string> = {
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  webmanifest: 'json',
  map: 'json',
  toml: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'ini',
  gitignore: 'ini',
  npmrc: 'ini',
  editorconfig: 'ini',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  hbs: 'handlebars',
  mts: 'typescript',
  cts: 'typescript',
  zsh: 'shell',
  fish: 'shell',
  psm1: 'powershell',
  ino: 'cpp',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  resx: 'xml',
  xaml: 'xml',
  plist: 'xml',
  svg: 'xml',
  gradle: 'kotlin',
  kts: 'kotlin',
  tf: 'hcl',
  lock: 'plaintext',
  txt: 'plaintext',
  log: 'plaintext',
};

const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.gitattributes': 'ini',
  '.env': 'ini',
  'cmakelists.txt': 'plaintext',
};

/** The Monaco language id for a file path, from its name or extension. */
export function languageForPath(monaco: Monaco, path: string): string {
  const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase();
  if (FILENAME_LANGUAGES[name]) return FILENAME_LANGUAGES[name];
  if (name.startsWith('.env')) return 'ini';
  if (name.startsWith('dockerfile')) return 'dockerfile';
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  if (ext && EXTENSION_LANGUAGES[ext]) return EXTENSION_LANGUAGES[ext];
  for (const language of monaco.languages.getLanguages()) {
    if (ext && language.extensions?.some((e) => e.toLowerCase() === `.${ext}`)) return language.id;
    if (language.filenames?.some((f) => f.toLowerCase() === name)) return language.id;
  }
  return 'plaintext';
}

/** JSON (with comments) highlighting; Monaco's JSON support otherwise comes with its language service. */
function registerJson(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === 'json')) return;
  monaco.languages.register({ id: 'json', extensions: ['.json', '.jsonc'], aliases: ['JSON'] });
  monaco.languages.setLanguageConfiguration('json', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}', notIn: ['string'] },
      { open: '[', close: ']', notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
    ],
  });
  monaco.languages.setMonarchTokensProvider('json', {
    tokenPostfix: '.json',
    tokenizer: {
      root: [
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'string.key'],
        [/"(?:[^"\\]|\\.)*"?/, 'string.value'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false|null)\b/, 'keyword'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
      ],
      comment: [
        [/[^*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/\*/, 'comment'],
      ],
    },
  });
}
