import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  BringToFront,
  ChartColumn,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  Italic,
  Lock,
  LockOpen,
  Minus,
  Shapes,
  Square,
  Trash,
  Type,
  Ungroup,
  Underline,
} from 'lucide-react';
import { toast } from 'sonner';
import { CHART_KINDS } from '@shared/design/charts';
import { estimateTextHeight } from '@shared/design/text';
import { ARTBOARD_PRESETS, FONTS, fontName, gradientCss, gradientStops, normalizeColor, resolveColor, THEMES } from '@shared/design/theme';
import type { Artboard, ChartElement, ColorToken, Design, DesignElement, DesignTheme, Gradient, ImageCrop, ImageElement, ImageFilters, LineElement, ShapeElement, TextElement } from '@shared/types/design';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuTrigger, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/menu';
import { FONTS_QUERY_KEY, useFontsQuery } from '@/lib/fonts';
import { invoke } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { useDesignEditor, useDesignLayout } from '@/stores/design';
import { addArtboard, alignSelection, deleteArtboard, deleteSelection, duplicateSelection, groupSelection, isWholeGroup, moveArtboard, reorderSelection, ungroupSelection } from './actions';

const TOKENS: ColorToken[] = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'];

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-b border-divider px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2', className)}>{children}</div>;
}

/** A number input that commits on blur or Enter, with a short label inside. */
function NumberField({ label, value, onChange, step = 1, min, max, suffix, testId }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; testId?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onChange(clamped);
    else setText(String(value));
  };
  return (
    <label className="no-drag flex h-8 items-center gap-1.5 rounded-lg border border-composer-border bg-composer px-2 focus-within:border-brand/60">
      <span className="w-7 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        data-testid={testId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = (Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            setText(String(n));
            onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
          }
        }}
        className="w-full min-w-0 bg-transparent text-right text-[12.5px] text-foreground tabular-nums outline-none"
      />
      {suffix && <span className="text-[11px] text-muted-foreground">{suffix}</span>}
    </label>
  );
}

/** Theme color names or a custom color. */
export function ColorField({ label, value, theme, onChange, allowNone, testId }: { label: string; value: string | undefined; theme: DesignTheme; onChange: (v: string | undefined) => void; allowNone?: boolean; testId?: string }) {
  const resolved = value ? resolveColor(value, theme, 'transparent') : 'transparent';
  const [hex, setHex] = useState(value ?? '');
  useEffect(() => setHex(value ?? ''), [value]);
  const isToken = value && (TOKENS as string[]).includes(value);
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button data-testid={testId} className="no-drag flex h-8 w-full items-center gap-2 rounded-lg border border-composer-border bg-composer px-2 text-left text-[12.5px] hover:bg-hover">
          <span className="size-4 shrink-0 rounded border border-black/15" style={{ background: resolved === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px' : resolved }} />
          <span className="min-w-0 flex-1 truncate text-foreground">{value ? (isToken ? value : value.toUpperCase()) : 'None'}</span>
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="end">
        <div className="mb-1.5 text-[11.5px] text-muted-foreground">Theme colors</div>
        <div className="grid grid-cols-7 gap-1.5">
          {TOKENS.map((token) => (
            <button key={token} title={token} onClick={() => onChange(token)} className={cn('size-7 rounded-md border border-black/15', value === token && 'ring-2 ring-brand ring-offset-1 ring-offset-menu')} style={{ background: theme.colors[token] }} />
          ))}
        </div>
        <div className="mt-3 mb-1.5 text-[11.5px] text-muted-foreground">Custom</div>
        <div className="flex items-center gap-2">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
          <Input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={() => {
              const color = normalizeColor(hex);
              if (color) onChange(color === 'transparent' ? undefined : color);
              else setHex(value ?? '');
            }}
            placeholder="#RRGGBB"
            className="h-8"
          />
        </div>
        {allowNone && (
          <button className="mt-2 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => onChange(undefined)}>
            No color
          </button>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

/** Linear/radial type, angle, and an editable list of color stops. */
function GradientEditor({ gradient, theme, onChange }: { gradient: Gradient; theme: DesignTheme; onChange: (g: Gradient) => void }) {
  const stops = gradientStops(gradient);
  const setStops = (next: typeof stops) => onChange({ type: gradient.type, angle: gradient.angle, stops: next });
  return (
    <div className="space-y-2">
      <Row>
        <Select value={gradient.type ?? 'linear'} onChange={(v) => onChange({ ...gradient, type: v === 'radial' ? 'radial' : undefined })} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }]} className="w-full min-w-0" />
        {(gradient.type ?? 'linear') === 'linear' && <NumberField label="Angle" value={gradient.angle ?? 180} onChange={(angle) => onChange({ ...gradient, angle })} min={0} max={360} suffix="°" />}
      </Row>
      <div className="h-6 rounded border border-black/10" style={{ background: gradientCss(gradient, theme) }} />
      <div className="space-y-1.5">
        {stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <ColorField label="Color" value={stop.color} theme={theme} onChange={(color) => setStops(stops.map((s, j) => (j === i ? { ...s, color: color ?? s.color } : s)))} />
            </div>
            <NumberField label="At" value={Math.round(stop.at * 100)} onChange={(v) => setStops(stops.map((s, j) => (j === i ? { ...s, at: Math.min(1, Math.max(0, v / 100)) } : s)))} min={0} max={100} suffix="%" />
            {stops.length > 2 && (
              <IconButton label="Remove stop" onClick={() => setStops(stops.filter((_, j) => j !== i))}>
                <Trash className="size-3.5" />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={() => setStops([...stops, { color: stops[stops.length - 1]?.color ?? 'secondary', at: 1 }])}>
        Add stop
      </Button>
    </div>
  );
}

function FontSelect({ value, theme, onChange }: { value: string | undefined; theme: DesignTheme; onChange: (v: string) => void }) {
  const { data: customFonts } = useFontsQuery();
  const options = [
    { value: 'heading', label: `Heading · ${theme.fonts.heading}` },
    { value: 'body', label: `Body · ${theme.fonts.body}` },
    ...FONTS.map((f) => ({ value: f.name, label: <span style={{ fontFamily: `'${f.name}'` }}>{f.name}</span> })),
    ...(customFonts ?? []).map((f) => ({ value: f.family, label: <span style={{ fontFamily: `'${f.family}'` }}>{f.family} ✦</span> })),
  ];
  const current = value ?? 'body';
  return <Select value={options.some((o) => o.value === current) ? current : 'body'} onChange={onChange} options={options} className="w-full" />;
}

/** Import a font file, or download a Google Font by name. Human-editor-only: the model can already set any font name, it just needs one imported first. */
function ImportFontButton() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: FONTS_QUERY_KEY });

  const importFile = async () => {
    const paths = await invoke('system:pickFiles', 'fonts');
    if (!paths.length) return;
    setBusy(true);
    try {
      const added = await invoke('fonts:addFiles', paths);
      await refresh();
      toast.success(added.length > 1 ? `Imported ${added.length} fonts` : `Imported "${added[0]?.family}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importGoogle = async () => {
    const family = name.trim();
    if (!family) return;
    setBusy(true);
    try {
      const font = await invoke('fonts:addGoogle', family);
      await refresh();
      toast.success(`Imported "${font.family}" from Google Fonts`);
      setName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button className="text-[12px] text-muted-foreground hover:text-foreground">Import font…</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void importFile()}>
          Choose a font file…
        </Button>
        <div className="my-2 text-center text-[11px] text-muted-foreground">or a Google Font</div>
        <div className="flex gap-1.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void importGoogle()} placeholder="e.g. Inter" className="h-8 min-w-0 flex-1" />
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => void importGoogle()}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

function Toggle({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton label={label} active={active} onClick={onClick} className="size-8 rounded-lg">
      {children}
    </IconButton>
  );
}

const TYPE_ICONS = { text: Type, rect: Square, ellipse: Circle, line: Minus, image: ImageIcon, chart: ChartColumn, svg: Shapes };

export function Inspector() {
  const tab = useDesignLayout((s) => s.inspectorTab);
  const setTab = useDesignLayout((s) => s.setInspectorTab);
  return (
    <aside data-testid="design-inspector" className="flex h-full w-[272px] shrink-0 flex-col border-l border-divider bg-background">
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-divider px-2">
        {(['properties', 'layers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('no-drag h-7 rounded-md px-2.5 text-[13px] capitalize text-muted-foreground hover:bg-hover hover:text-foreground', tab === t && 'bg-selected text-foreground hover:bg-selected')}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'properties' ? <Properties /> : <Layers />}</div>
    </aside>
  );
}

function Properties() {
  const design = useDesignEditor((s) => s.design)!;
  const selection = useDesignEditor((s) => s.selection);
  const artboard = design.artboards.find((a) => a.id === selection.artboardId);
  const elements = artboard?.elements.filter((e) => selection.elementIds.includes(e.id)) ?? [];
  if (!artboard) return <ThemePanel design={design} />;
  if (elements.length === 0)
    return (
      <>
        <ArtboardPanel artboard={artboard} design={design} />
        <ThemePanel design={design} />
      </>
    );
  if (elements.length > 1) return <MultiPanel count={elements.length} grouped={isWholeGroup(artboard, selection.elementIds)} />;
  return <ElementPanel artboard={artboard} el={elements[0]} theme={design.theme} design={design} />;
}

function patch(artboardId: string, id: string, changes: Partial<DesignElement>) {
  useDesignEditor.getState().patchElements(artboardId, { [id]: changes });
}

function ArrangeSection({ single, grouped }: { single: boolean; grouped?: boolean }) {
  return (
    <Section title={single ? 'Align to artboard' : 'Align'}>
      <div className="flex flex-wrap gap-0.5">
        <Toggle label="Align left" onClick={() => alignSelection('left')}>
          <AlignStartVertical className="size-4" />
        </Toggle>
        <Toggle label="Align centers" onClick={() => alignSelection('center')}>
          <AlignCenterVertical className="size-4" />
        </Toggle>
        <Toggle label="Align right" onClick={() => alignSelection('right')}>
          <AlignEndVertical className="size-4" />
        </Toggle>
        <Toggle label="Align top" onClick={() => alignSelection('top')}>
          <AlignStartHorizontal className="size-4" />
        </Toggle>
        <Toggle label="Align middles" onClick={() => alignSelection('middle')}>
          <AlignCenterHorizontal className="size-4" />
        </Toggle>
        <Toggle label="Align bottom" onClick={() => alignSelection('bottom')}>
          <AlignEndHorizontal className="size-4" />
        </Toggle>
      </div>
      <div className="flex flex-wrap gap-0.5">
        <Toggle label="Bring to front" onClick={() => reorderSelection('front')}>
          <ArrowUpToLine className="size-4" />
        </Toggle>
        <Toggle label="Bring forward" onClick={() => reorderSelection('forward')}>
          <ArrowUp className="size-4" />
        </Toggle>
        <Toggle label="Send backward" onClick={() => reorderSelection('backward')}>
          <ArrowDown className="size-4" />
        </Toggle>
        <Toggle label="Send to back" onClick={() => reorderSelection('back')}>
          <ArrowDownToLine className="size-4" />
        </Toggle>
        {!single && (
          <Toggle label={grouped ? 'Ungroup  Ctrl+Shift+G' : 'Group  Ctrl+G'} onClick={grouped ? ungroupSelection : groupSelection}>
            {grouped ? <Ungroup className="size-4" /> : <Group className="size-4" />}
          </Toggle>
        )}
        <div className="flex-1" />
        <Toggle label="Duplicate  Ctrl+D" onClick={() => duplicateSelection()}>
          <Copy className="size-4" />
        </Toggle>
        <Toggle label="Delete  Del" onClick={deleteSelection}>
          <Trash className="size-4" />
        </Toggle>
      </div>
    </Section>
  );
}

function MultiPanel({ count, grouped }: { count: number; grouped: boolean }) {
  return (
    <>
      <div className="px-3.5 pt-3 text-[13px] text-foreground">{count} elements selected</div>
      <ArrangeSection single={false} grouped={grouped} />
    </>
  );
}

function ElementPanel({ artboard, el, theme, design }: { artboard: Artboard; el: DesignElement; theme: DesignTheme; design: Design }) {
  const set = (changes: Partial<DesignElement>) => patch(artboard.id, el.id, changes);
  const Icon = TYPE_ICONS[el.type];
  return (
    <>
      <div className="flex items-center gap-2 px-3.5 pt-3 text-[13px] text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        <span className="capitalize">{el.type === 'rect' ? 'Rectangle' : el.type === 'svg' ? 'Vector' : el.type}</span>
        <span className="text-[11.5px] text-muted-foreground">{el.id}</span>
        <div className="flex-1" />
        <IconButton label={el.locked ? 'Unlock' : 'Lock'} onClick={() => set({ locked: !el.locked || undefined })} active={el.locked}>
          {el.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
        </IconButton>
      </div>
      <Section title="Position">
        <Row>
          <NumberField label="X" value={el.x} onChange={(x) => set({ x })} testId="prop-x" />
          <NumberField label="Y" value={el.y} onChange={(y) => set({ y })} testId="prop-y" />
          <NumberField label="W" value={el.w} onChange={(w) => set({ w })} min={el.type === 'line' ? -20000 : 1} testId="prop-w" />
          <NumberField label="H" value={el.h} onChange={(h) => set({ h })} min={el.type === 'line' ? -20000 : 1} testId="prop-h" />
          <NumberField label="Rot" value={el.rotation ?? 0} onChange={(rotation) => set({ rotation: rotation || undefined })} min={-360} max={360} suffix="°" />
          <NumberField label="Opac" value={Math.round((el.opacity ?? 1) * 100)} onChange={(v) => set({ opacity: v >= 100 ? undefined : v / 100 })} min={0} max={100} suffix="%" />
        </Row>
      </Section>
      <LinkSection el={el} design={design} set={set} />
      {el.type === 'text' && <TextSection artboard={artboard} el={el} theme={theme} />}
      {(el.type === 'rect' || el.type === 'ellipse') && <ShapeSection el={el} theme={theme} set={set} />}
      {el.type === 'line' && <LineSection el={el} theme={theme} set={set} />}
      {el.type === 'image' && <ImageSection el={el} set={set} />}
      {el.type === 'chart' && <ChartSection el={el} theme={theme} set={set} />}
      <ArrangeSection single />
    </>
  );
}

/** Makes any element a clickable hotspot in Present and in exported HTML/PDF/PowerPoint — jump to another artboard, or open a URL. */
function LinkSection({ el, design, set }: { el: DesignElement; design: Design; set: (c: Partial<DesignElement>) => void }) {
  const kind = el.link?.kind ?? 'none';
  return (
    <Section title="Link">
      <Row>
        <Select
          value={kind}
          onChange={(v) => set({ link: v === 'none' ? undefined : v === 'artboard' ? { kind: 'artboard', artboard: design.artboards.find((a) => a.id !== el.id)?.id ?? design.artboards[0]?.id ?? '' } : { kind: 'url', url: '' } })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'artboard', label: 'Jump to artboard' },
            { value: 'url', label: 'Open a URL' },
          ]}
          className="w-full min-w-0"
          testId="link-kind"
        />
        {kind === 'artboard' && (
          <Select
            value={design.artboards.some((a) => a.id === el.link?.artboard) ? el.link!.artboard! : (design.artboards[0]?.id ?? '')}
            onChange={(artboard) => set({ link: { kind: 'artboard', artboard } })}
            options={design.artboards.map((a) => ({ value: a.id, label: a.name }))}
            className="w-full min-w-0"
            disabled={design.artboards.length === 0}
            testId="link-artboard"
          />
        )}
      </Row>
      {kind === 'url' && <Input value={el.link?.url ?? ''} onChange={(e) => set({ link: { kind: 'url', url: e.target.value } })} placeholder="https://…" />}
    </Section>
  );
}

function TextSection({ artboard, el, theme }: { artboard: Artboard; el: TextElement; theme: DesignTheme }) {
  const set = (changes: Partial<TextElement>) => patch(artboard.id, el.id, changes);
  const [text, setText] = useState(el.text);
  useEffect(() => setText(el.text), [el.text]);
  return (
    <Section title="Text" action={<ImportFontButton />}>
      <Textarea data-testid="prop-text" value={text} rows={3} onChange={(e) => setText(e.target.value)} onBlur={() => text !== el.text && set({ text })} className="text-[12.5px]" />
      <FontSelect value={el.font} theme={theme} onChange={(font) => set({ font: font === 'body' ? undefined : font })} />
      <Row>
        <NumberField label="Size" value={el.size} onChange={(size) => set({ size })} min={4} max={1000} testId="prop-size" />
        <Select
          value={String(el.weight ?? 400)}
          onChange={(v) => set({ weight: Number(v) === 400 ? undefined : Number(v) })}
          options={[300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[w] }))}
          className="w-full min-w-0"
        />
        <NumberField label="Line" value={el.lineHeight ?? 1.25} onChange={(lineHeight) => set({ lineHeight })} step={0.05} min={0.7} max={3} />
        <NumberField label="Track" value={Math.round((el.letterSpacing ?? 0) * 1000) / 10} onChange={(v) => set({ letterSpacing: v ? v / 100 : undefined })} step={0.5} min={-20} max={100} suffix="%" />
      </Row>
      <div className="flex flex-wrap gap-0.5">
        <Toggle label="Align left" active={(el.align ?? 'left') === 'left'} onClick={() => set({ align: undefined })}>
          <AlignLeft className="size-4" />
        </Toggle>
        <Toggle label="Center" active={el.align === 'center'} onClick={() => set({ align: 'center' })}>
          <AlignCenter className="size-4" />
        </Toggle>
        <Toggle label="Align right" active={el.align === 'right'} onClick={() => set({ align: 'right' })}>
          <AlignRight className="size-4" />
        </Toggle>
        <Toggle label="Justify" active={el.align === 'justify'} onClick={() => set({ align: 'justify' })}>
          <AlignJustify className="size-4" />
        </Toggle>
        <Toggle label="Italic" active={el.italic} onClick={() => set({ italic: !el.italic || undefined })}>
          <Italic className="size-4" />
        </Toggle>
        <Toggle label="Underline" active={el.underline} onClick={() => set({ underline: !el.underline || undefined })}>
          <Underline className="size-4" />
        </Toggle>
        <Toggle label="Uppercase" active={el.uppercase} onClick={() => set({ uppercase: !el.uppercase || undefined })}>
          <span className="text-[11px] font-semibold">AA</span>
        </Toggle>
      </div>
      <Row>
        <Select value={el.valign ?? 'top'} onChange={(v) => set({ valign: v === 'top' ? undefined : v })} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} className="w-full min-w-0" />
        <Select value={el.list ?? 'none'} onChange={(v) => set({ list: v === 'none' ? undefined : v })} options={[{ value: 'none', label: 'No list' }, { value: 'bullet', label: 'Bullets' }, { value: 'number', label: 'Numbers' }]} className="w-full min-w-0" />
      </Row>
      <ColorField label="Text" value={el.color ?? 'text'} theme={theme} onChange={(color) => set({ color: color ?? 'text' })} testId="prop-color" />
      <ColorField label="Background" value={el.fill} theme={theme} onChange={(fill) => set({ fill })} allowNone />
      <Button size="sm" variant="outline" className="w-full" onClick={() => set({ h: estimateTextHeight(el, fontName(el.font, theme)) })}>
        Fit height to text
      </Button>
    </Section>
  );
}

function ShapeSection({ el, theme, set }: { el: ShapeElement; theme: DesignTheme; set: (c: Partial<ShapeElement>) => void }) {
  return (
    <Section
      title="Fill and border"
      action={
        <button
          className="text-[12px] text-muted-foreground hover:text-foreground"
          onClick={() => (el.gradient ? set({ gradient: undefined, fill: el.gradient.stops?.[0]?.color ?? el.gradient.from ?? el.fill }) : set({ gradient: { angle: 180, stops: [{ color: el.fill ?? 'primary', at: 0 }, { color: 'secondary', at: 1 }] } }))}
        >
          {el.gradient ? 'Use solid fill' : 'Use gradient'}
        </button>
      }
    >
      {el.gradient ? <GradientEditor gradient={el.gradient} theme={theme} onChange={(gradient) => set({ gradient })} /> : <ColorField label="Fill" value={el.fill} theme={theme} onChange={(fill) => set({ fill: fill ?? 'transparent' })} allowNone testId="prop-fill" />}
      <ColorField label="Border" value={el.stroke} theme={theme} onChange={(stroke) => set({ stroke })} allowNone />
      <Row>
        <NumberField label="Bord" value={el.strokeWidth ?? (el.stroke ? 1 : 0)} onChange={(strokeWidth) => set({ strokeWidth })} min={0} max={200} />
        {el.type === 'rect' && <NumberField label="Rad" value={el.radius ?? 0} onChange={(radius) => set({ radius: radius || undefined })} min={0} max={5000} />}
      </Row>
      <label className="flex items-center justify-between text-[12.5px] text-fg-2">
        Shadow <Switch checked={!!el.shadow} onCheckedChange={(shadow) => set({ shadow: shadow || undefined })} />
      </label>
    </Section>
  );
}

function LineSection({ el, theme, set }: { el: LineElement; theme: DesignTheme; set: (c: Partial<LineElement>) => void }) {
  return (
    <Section title="Line">
      <ColorField label="Color" value={el.stroke ?? 'muted'} theme={theme} onChange={(stroke) => set({ stroke: stroke ?? 'muted' })} />
      <Row>
        <NumberField label="Width" value={el.strokeWidth ?? 2} onChange={(strokeWidth) => set({ strokeWidth })} min={0.5} max={200} step={0.5} />
        <label className="flex items-center justify-between text-[12.5px] text-fg-2">
          Dashed <Switch checked={!!el.dashed} onCheckedChange={(dashed) => set({ dashed: dashed || undefined })} />
        </label>
      </Row>
    </Section>
  );
}

function ImageSection({ el, set }: { el: ImageElement; set: (c: Partial<ImageElement>) => void }) {
  const replace = async () => {
    const paths = await invoke('system:pickFiles', 'attachments');
    const refs = paths.length ? (await invoke('attachments:fromPaths', paths.slice(0, 1))).filter((r) => r.kind === 'image') : [];
    if (refs[0]) set({ src: `attachment:${refs[0].id}`, alt: refs[0].name });
  };
  const crop = el.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const setCrop = (patch: Partial<ImageCrop>) => set({ crop: { ...crop, ...patch } });
  const filters = el.filters ?? {};
  const setFilters = (patch: Partial<ImageFilters>) => set({ filters: { ...filters, ...patch } });
  return (
    <>
      <Section title="Image">
        <Button size="sm" variant="outline" className="w-full" onClick={() => void replace()}>
          {el.src ? 'Replace image…' : 'Choose image…'}
        </Button>
        <Row>
          <Select value={el.fit ?? 'cover'} onChange={(fit) => set({ fit })} options={[{ value: 'cover', label: 'Fill (crop)' }, { value: 'contain', label: 'Fit' }]} className="w-full min-w-0" disabled={!!el.crop} />
          <NumberField label="Rad" value={el.radius ?? 0} onChange={(radius) => set({ radius: radius || undefined })} min={0} />
        </Row>
        <Input value={el.alt ?? ''} onChange={(e) => set({ alt: e.target.value || undefined })} placeholder="Description (alt text)" />
      </Section>
      <Section
        title="Crop"
        action={
          el.crop && (
            <button className="text-[12px] text-muted-foreground hover:text-foreground" onClick={() => set({ crop: undefined })}>
              Reset
            </button>
          )
        }
      >
        <Row>
          <NumberField label="X" value={Math.round(crop.x * 100)} onChange={(v) => setCrop({ x: v / 100 })} min={0} max={99} suffix="%" />
          <NumberField label="Y" value={Math.round(crop.y * 100)} onChange={(v) => setCrop({ y: v / 100 })} min={0} max={99} suffix="%" />
          <NumberField label="W" value={Math.round(crop.w * 100)} onChange={(v) => setCrop({ w: Math.max(1, v) / 100 })} min={1} max={100} suffix="%" />
          <NumberField label="H" value={Math.round(crop.h * 100)} onChange={(v) => setCrop({ h: Math.max(1, v) / 100 })} min={1} max={100} suffix="%" />
        </Row>
      </Section>
      <Section title="Filters">
        <Row>
          <NumberField label="Bright" value={Math.round((filters.brightness ?? 1) * 100)} onChange={(v) => setFilters({ brightness: v / 100 })} min={0} max={300} suffix="%" />
          <NumberField label="Cont" value={Math.round((filters.contrast ?? 1) * 100)} onChange={(v) => setFilters({ contrast: v / 100 })} min={0} max={300} suffix="%" />
          <NumberField label="Sat" value={Math.round((filters.saturate ?? 1) * 100)} onChange={(v) => setFilters({ saturate: v / 100 })} min={0} max={300} suffix="%" />
        </Row>
      </Section>
    </>
  );
}

/** "label,Series A,Series B" CSV for editing chart data. */
function chartToCsv(el: ChartElement): string {
  const head = ['label', ...el.chart.series.map((s) => s.name)].join(', ');
  return [head, ...el.chart.labels.map((label, i) => [label, ...el.chart.series.map((s) => s.values[i] ?? 0)].join(', '))].join('\n');
}

function csvToChart(csv: string, el: ChartElement): ChartElement['chart'] | null {
  const rows = csv
    .split('\n')
    .map((r) => r.split(/[,;\t]/).map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const names = rows[0].slice(1);
  const labels = rows.slice(1).map((r) => r[0]);
  const series = names.map((name, i) => ({ name: name || `Series ${i + 1}`, values: rows.slice(1).map((r) => Number(String(r[i + 1] ?? '').replace(/[^\d.eE+-]/g, '')) || 0), ...(el.chart.series[i]?.color ? { color: el.chart.series[i].color } : {}) }));
  return { ...el.chart, labels, series };
}

function ChartSection({ el, theme, set }: { el: ChartElement; theme: DesignTheme; set: (c: Partial<ChartElement>) => void }) {
  const [csv, setCsv] = useState(chartToCsv(el));
  useEffect(() => setCsv(chartToCsv(el)), [el]);
  const chart = (changes: Partial<ChartElement['chart']>) => set({ chart: { ...el.chart, ...changes } });
  return (
    <Section title="Chart">
      <Row>
        <Select value={el.chart.kind} onChange={(kind) => chart({ kind })} options={CHART_KINDS.map((k) => ({ value: k, label: { bar: 'Columns', hbar: 'Bars', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut' }[k] }))} className="w-full min-w-0" />
        <Input value={el.chart.unit ?? ''} onChange={(e) => chart({ unit: e.target.value.slice(0, 8) || undefined })} placeholder="Unit" />
      </Row>
      <Input value={el.chart.title ?? ''} onChange={(e) => chart({ title: e.target.value || undefined })} placeholder="Chart title" />
      <div className="text-[11.5px] text-muted-foreground">Data (first row: series names)</div>
      <Textarea
        data-testid="prop-chart-data"
        rows={Math.min(10, el.chart.labels.length + 2)}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        onBlur={() => {
          const next = csvToChart(csv, el);
          if (next) set({ chart: next });
          else setCsv(chartToCsv(el));
        }}
        className="font-mono text-[11.5px]"
      />
      <div className="grid grid-cols-3 gap-2 text-[12px] text-fg-2">
        <label className="flex flex-col items-start gap-1">
          Values <Switch checked={!!el.chart.values} onCheckedChange={(values) => chart({ values })} />
        </label>
        <label className="flex flex-col items-start gap-1">
          Legend <Switch checked={el.chart.legend ?? (el.chart.series.length > 1 || el.chart.kind === 'pie' || el.chart.kind === 'donut')} onCheckedChange={(legend) => chart({ legend })} />
        </label>
        <label className="flex flex-col items-start gap-1">
          Stacked <Switch checked={!!el.chart.stacked} onCheckedChange={(stacked) => chart({ stacked: stacked || undefined })} />
        </label>
      </div>
      <ColorField label="Labels" value={el.color ?? 'text'} theme={theme} onChange={(color) => set({ color: color === 'text' ? undefined : color })} />
    </Section>
  );
}

function ArtboardPanel({ artboard, design }: { artboard: Artboard; design: Design }) {
  const change = useDesignEditor((s) => s.change);
  const [name, setName] = useState(artboard.name);
  const [notes, setNotes] = useState(artboard.notes ?? '');
  useEffect(() => {
    setName(artboard.name);
    setNotes(artboard.notes ?? '');
  }, [artboard.id, artboard.name, artboard.notes]);
  const update = (fn: (a: Artboard) => void) => change((d) => fn(d.artboards.find((a) => a.id === artboard.id)!));
  const preset = Object.entries(ARTBOARD_PRESETS).find(([, p]) => p.width === artboard.width && p.height === artboard.height)?.[0] ?? 'custom';
  const index = design.artboards.findIndex((a) => a.id === artboard.id);
  return (
    <Section
      title="Artboard"
      action={
        <Menu>
          <MenuTrigger asChild>
            <button className="text-[12px] text-muted-foreground hover:text-foreground">More</button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Copy />} onSelect={() => addArtboard({ copyOf: artboard.id })}>
              Duplicate artboard
            </MenuItem>
            <MenuItem icon={<ArrowUp className="-rotate-90" />} disabled={index === 0} onSelect={() => moveArtboard(artboard.id, -1)}>
              Move left
            </MenuItem>
            <MenuItem icon={<ArrowDown className="-rotate-90" />} disabled={index === design.artboards.length - 1} onSelect={() => moveArtboard(artboard.id, 1)}>
              Move right
            </MenuItem>
            <MenuItem icon={<Trash />} destructive onSelect={() => deleteArtboard(artboard.id)}>
              Delete artboard
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    >
      <Input data-testid="artboard-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== artboard.name && update((a) => (a.name = name.trim().slice(0, 80)))} />
      <Select
        value={preset}
        onChange={(v) => {
          const p = ARTBOARD_PRESETS[v];
          if (p) update((a) => Object.assign(a, { width: p.width, height: p.height }));
        }}
        options={[...Object.entries(ARTBOARD_PRESETS).map(([id, p]) => ({ value: id, label: `${p.label} · ${p.width}×${p.height}` })), ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom size' }] : [])]}
        className="w-full"
      />
      <Row>
        <NumberField label="W" value={artboard.width} onChange={(width) => update((a) => (a.width = Math.round(width)))} min={50} max={8000} />
        <NumberField label="H" value={artboard.height} onChange={(height) => update((a) => (a.height = Math.round(height)))} min={50} max={8000} />
      </Row>
      <Select
        value={artboard.transition ?? 'none'}
        onChange={(v) => update((a) => (a.transition = v === 'none' ? undefined : (v as Artboard['transition'])))}
        options={[
          { value: 'none', label: 'No transition' },
          { value: 'fade', label: 'Fade' },
          { value: 'slide-left', label: 'Slide left' },
          { value: 'slide-right', label: 'Slide right' },
          { value: 'slide-up', label: 'Slide up' },
          { value: 'slide-down', label: 'Slide down' },
        ]}
        className="w-full"
      />
      <div className="text-[11px] text-muted-foreground">Present transition into this artboard from the previous one.</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-muted-foreground">Background</span>
          <button
            className="text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => update((a) => (artboard.gradient ? delete a.gradient : (a.gradient = { angle: 180, stops: [{ color: a.background, at: 0 }, { color: 'secondary', at: 1 }] })))}
          >
            {artboard.gradient ? 'Use solid fill' : 'Use gradient'}
          </button>
        </div>
        {artboard.gradient ? <GradientEditor gradient={artboard.gradient} theme={design.theme} onChange={(gradient) => update((a) => (a.gradient = gradient))} /> : <ColorField label="Background" value={artboard.background} theme={design.theme} onChange={(bg) => update((a) => (a.background = bg ?? 'background'))} />}
      </div>
      <Textarea value={notes} rows={2} placeholder="Speaker notes" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (artboard.notes ?? '') && update((a) => (a.notes = notes || undefined))} className="text-[12.5px]" />
    </Section>
  );
}

function ThemePanel({ design }: { design: Design }) {
  const change = useDesignEditor((s) => s.change);
  const theme = design.theme;
  const { data: customFonts } = useFontsQuery();
  return (
    <Section title="Theme" action={<ImportFontButton />}>
      <div className="grid grid-cols-2 gap-1.5" data-testid="theme-presets">
        {THEMES.map((preset) => (
          <button
            key={preset.id}
            title={preset.name}
            onClick={() => change((d) => (d.theme = structuredClone(preset)))}
            className={cn('flex flex-col gap-1 rounded-lg border p-1.5 text-left hover:border-brand/60', theme.id === preset.id ? 'border-brand' : 'border-composer-border')}
          >
            <span className="flex h-5 overflow-hidden rounded" style={{ background: preset.colors.background }}>
              {(['primary', 'secondary', 'accent', 'text'] as const).map((k) => (
                <span key={k} className="flex-1" style={{ background: preset.colors[k], margin: '4px 2px' }} />
              ))}
            </span>
            <span className="truncate text-[11.5px] text-fg-2" style={{ fontFamily: `'${preset.fonts.heading}'` }}>
              {preset.name}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-1.5 pt-1">
        {TOKENS.map((token) => (
          <label key={token} className="flex h-7 items-center gap-2 text-[12px] text-fg-2">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(theme.colors[token]) ? theme.colors[token] : '#000000'}
              onChange={(e) =>
                change((d) => {
                  d.theme.colors[token] = e.target.value.toUpperCase();
                  if (d.theme.id !== 'custom') d.theme = { ...d.theme, id: 'custom', name: `${d.theme.name.replace(/ \(custom\)$/, '')} (custom)` };
                })
              }
              className="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="flex-1 capitalize">{token}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{theme.colors[token]}</span>
          </label>
        ))}
      </div>
      <div className="space-y-1.5 pt-1">
        {(['heading', 'body'] as const).map((key) => (
          <div key={key} className="flex items-center gap-2 text-[12px] text-fg-2">
            <span className="w-14 capitalize">{key}</span>
            <Select
              value={FONTS.some((f) => f.name === theme.fonts[key]) || customFonts?.some((f) => f.family === theme.fonts[key]) ? theme.fonts[key] : FONTS[0].name}
              onChange={(font) => change((d) => (d.theme.fonts[key] = font))}
              options={[
                ...FONTS.map((f) => ({ value: f.name, label: <span style={{ fontFamily: `'${f.name}'` }}>{f.name}</span> })),
                ...(customFonts ?? []).map((f) => ({ value: f.family, label: <span style={{ fontFamily: `'${f.family}'` }}>{f.family} ✦</span> })),
              ]}
              className="min-w-0 flex-1"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Layers() {
  const design = useDesignEditor((s) => s.design)!;
  const selection = useDesignEditor((s) => s.selection);
  const select = useDesignEditor((s) => s.select);
  const artboard = design.artboards.find((a) => a.id === selection.artboardId);
  if (!artboard) return <div className="p-4 text-[13px] text-muted-foreground">Select an artboard to see its layers.</div>;
  const label = (el: DesignElement) => el.name ?? (el.type === 'text' ? el.text.replace(/\*\*/g, '').split('\n')[0].slice(0, 40) || 'Text' : el.type === 'chart' ? el.chart.title ?? `${el.chart.kind} chart` : el.type);
  return (
    <div className="py-1" data-testid="layers">
      <div className="px-3.5 py-2 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">{artboard.name}</div>
      {[...artboard.elements].reverse().map((el) => {
        const Icon = TYPE_ICONS[el.type];
        const active = selection.elementIds.includes(el.id);
        return (
          <div key={el.id} className={cn('group flex h-8 items-center gap-2 px-3 text-[12.5px]', active ? 'bg-selected text-foreground' : 'text-fg-2 hover:bg-hover')}>
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={(e) => select({ artboardId: artboard.id, elementIds: e.shiftKey ? [...new Set([...selection.elementIds, el.id])] : [el.id] })}>
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', el.hidden && 'opacity-50')}>{label(el)}</span>
            </button>
            <button aria-label={el.hidden ? 'Show' : 'Hide'} className={cn('text-muted-foreground hover:text-foreground', !el.hidden && 'opacity-0 group-hover:opacity-100')} onClick={() => patch(artboard.id, el.id, { hidden: !el.hidden || undefined })}>
              {el.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button aria-label={el.locked ? 'Unlock' : 'Lock'} className={cn('text-muted-foreground hover:text-foreground', !el.locked && 'opacity-0 group-hover:opacity-100')} onClick={() => patch(artboard.id, el.id, { locked: !el.locked || undefined })}>
              {el.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
          </div>
        );
      })}
      {artboard.elements.length === 0 && <div className="px-3.5 py-2 text-[12.5px] text-muted-foreground">No elements yet.</div>}
      <div className="px-3.5 pt-2 text-[11.5px] text-muted-foreground">
        <BringToFront className="mr-1 inline size-3" /> Top of the list is drawn on top.
      </div>
    </div>
  );
}
