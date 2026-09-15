import { z } from 'zod';
import { CHART_KINDS } from '@shared/design/charts';
import { checkArtboard } from '@shared/design/check';
import { LAYOUT_NAMES, layoutContent, layoutName, layoutsFor } from '@shared/design/layouts';
import { canonicalFields, elementIds, newArtboardId, normalizeElement, patchElement, LIMITS } from '@shared/design/normalize';
import { buildLayout, describeArtboard, describeElement, duplicateArtboard, findArtboard, findElement, reorderElement, resizeArtboard, type OrderChange } from '@shared/design/ops';
import { ARTBOARD_PRESETS, customizeTheme, FORMAT_DEFAULTS, normalizeColor, parseSize, themeById, THEMES } from '@shared/design/theme';
import type { Artboard, Design, DesignElement } from '@shared/types/design';
import { defineTool, ToolError, type AgentTool, type ToolContext } from '../agent/tools/types';
import { getDesign, updateDesign } from './store';

const num = z.union([z.number(), z.string()]);

const elementSchema = z
  .looseObject({
    type: z.string().describe('text, rect, ellipse, line, image, chart or svg'),
    x: num.optional().describe('Left edge in px (or "50%", "center")'),
    y: num.optional().describe('Top edge in px (or "50%", "center")'),
    w: num.optional().describe('Width in px'),
    h: num.optional().describe('Height in px (text: omit to fit the text)'),
    text: z.string().optional().describe('text: the words. New lines start paragraphs; **bold** spans'),
    size: num.optional().describe('text: font size in px'),
    font: z.string().optional().describe('"heading", "body" or a font name'),
    weight: num.optional().describe('400 regular, 600 semibold, 700 bold, 800 extra bold'),
    color: z.string().optional().describe('text color: theme color (text, muted, primary, secondary, accent, background, surface) or hex'),
    align: z.string().optional().describe('left, center, right or justify'),
    list: z.string().optional().describe('text: "bullet" or "number" makes each line a list item'),
    fill: z.string().optional().describe('rect/ellipse fill, or a text box background'),
    stroke: z.string().optional().describe('Border or line color'),
    radius: num.optional().describe('Corner radius in px'),
    src: z.string().optional().describe('image: "attachment:<id>" of an image the user attached; empty for a placeholder'),
    chart: z
      .looseObject({
        kind: z.string().optional().describe(CHART_KINDS.join(', ')),
        labels: z.array(z.string()),
        series: z.array(z.object({ name: z.string(), values: z.array(num) })),
        title: z.string().optional(),
        unit: z.string().optional(),
        values: z.boolean().optional().describe('Print values on the chart'),
      })
      .optional(),
    svg: z.string().optional().describe('svg: a complete <svg> for an icon, logo or illustration'),
  })
  .describe('An element. Coordinates are pixels from the artboard top-left.');

const contentSchema = z
  .looseObject({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    kicker: z.string().optional().describe('Short label above the title'),
    body: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    image: z.string().optional().describe('attachment:<id> of an attached image'),
    chart: z.looseObject({ kind: z.string().optional().describe(CHART_KINDS.join(', ')), labels: z.array(z.string()), series: z.array(z.object({ name: z.string(), values: z.array(num) })) }).optional(),
    quote: z.string().optional(),
    author: z.string().optional(),
    stats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    columns: z.array(z.looseObject({ title: z.string().optional(), body: z.string().optional(), bullets: z.array(z.string()).optional() })).optional(),
    items: z.array(z.looseObject({ title: z.string(), body: z.string().optional() })).optional(),
    cta: z.string().optional().describe('Button label'),
    footer: z.string().optional(),
  })
  .describe('Content the layout arranges');

function designId(ctx: ToolContext): string {
  const id = ctx.task.design?.designId;
  if (!id) throw new ToolError('Design tools only work in a Design session.');
  return id;
}

function artboardOrThrow(design: Design, ref: unknown, ctx: ToolContext): Artboard {
  if (ref === undefined || ref === null || ref === '') {
    const selected = ctx.task.design?.selection?.artboardId;
    const fallback = (selected && design.artboards.find((a) => a.id === selected)) ?? (design.artboards.length === 1 ? design.artboards[0] : undefined);
    if (fallback) return fallback;
    throw new ToolError(design.artboards.length ? `Say which artboard: ${design.artboards.map((a) => `${a.id} "${a.name}"`).join(', ')}.` : 'The design has no artboards yet. Create one with create_artboard.');
  }
  const found = findArtboard(design, ref);
  if (!found) throw new ToolError(`No artboard "${String(ref)}". Artboards: ${design.artboards.map((a) => `${a.id} "${a.name}"`).join(', ') || 'none yet'}.`);
  return found;
}

function report(design: Design, artboard: Artboard, head: string, notes: string[] = []): string {
  const index = design.artboards.findIndex((a) => a.id === artboard.id);
  const problems = checkArtboard(artboard, design.theme);
  return [
    head,
    describeArtboard(artboard, index),
    ...notes.map((n) => `Note: ${n}`),
    problems.length ? `Layout problems to fix (use edit_elements):\n${problems.map((p) => `- ${p}`).join('\n')}` : 'Layout check: no overlapping or overflowing text found.',
  ].join('\n');
}

function addElements(design: Design, artboard: Artboard, items: unknown[] | undefined, errors: string[]): DesignElement[] {
  const ids = elementIds(design);
  const added: DesignElement[] = [];
  for (const [i, item] of (items ?? []).entries()) {
    if (artboard.elements.length >= LIMITS.elements) {
      errors.push(`Artboard ${artboard.id} is full (${LIMITS.elements} elements).`);
      break;
    }
    const { element, error } = normalizeElement(item, { width: artboard.width, height: artboard.height, theme: design.theme, ids });
    if (element) {
      artboard.elements.push(element);
      added.push(element);
    } else errors.push(`Element ${i + 1}: ${error}`);
  }
  return added;
}

export const getDesignTool = defineTool({
  name: 'get_design',
  description: 'Read the design: theme, artboards and every element with its id, position and size. Pass an artboard to get its elements as full JSON.',
  category: 'read',
  input: z.object({ artboard: z.string().optional().describe('Artboard id, name or number for full element details') }),
  async run(args, ctx) {
    const design = getDesign(designId(ctx));
    if (args.artboard) {
      const artboard = artboardOrThrow(design, args.artboard, ctx);
      const elements = artboard.elements.map((e) => JSON.stringify(e.type === 'image' && e.src.startsWith('data:') ? { ...e, src: '(embedded image)' } : e)).join('\n');
      return `${artboard.id} "${artboard.name}" ${artboard.width}×${artboard.height} background ${artboard.background}${artboard.notes ? `\nNotes: ${artboard.notes}` : ''}\nElements (bottom to top):\n${elements || '(none)'}`;
    }
    return designOutline(design, 40_000);
  },
});

export function designOutline(design: Design, maxChars: number): string {
  const theme = design.theme;
  const head = `Design "${design.title}" (${FORMAT_DEFAULTS[design.format]?.label ?? design.format}). Theme "${theme.name}": ${Object.entries(theme.colors).map(([k, v]) => `${k} ${v}`).join(', ')}; fonts heading ${theme.fonts.heading}, body ${theme.fonts.body}.`;
  if (design.artboards.length === 0) return `${head}\nNo artboards yet.`;
  const full = `${head}\nArtboards (elements listed bottom to top):\n${design.artboards.map((a, i) => describeArtboard(a, i)).join('\n')}`;
  if (full.length <= maxChars) return full;
  return `${head}\nArtboards (call get_design with an artboard for its elements):\n${design.artboards.map((a, i) => describeArtboard(a, i, false)).join('\n')}`;
}

export const setThemeTool = defineTool({
  name: 'set_theme',
  description: `Set the design's colors and fonts. Elements that use theme color names ("primary", "text"…) and "heading"/"body" fonts update everywhere. Presets: ${THEMES.map((t) => `${t.id} (${t.name})`).join(', ')}.`,
  category: 'design',
  input: z.object({
    preset: z.string().optional().describe('A preset id to start from'),
    colors: z.looseObject({ background: z.string().optional(), surface: z.string().optional(), text: z.string().optional(), muted: z.string().optional(), primary: z.string().optional(), secondary: z.string().optional(), accent: z.string().optional() }).optional().describe('Hex colors to change'),
    fonts: z.object({ heading: z.string().optional(), body: z.string().optional() }).optional(),
  }),
  async run(args, ctx) {
    if (args.preset && !themeById(args.preset)) throw new ToolError(`Unknown preset "${args.preset}". Presets: ${THEMES.map((t) => t.id).join(', ')}.`);
    const { design } = updateDesign(designId(ctx), (d) => {
      d.theme = customizeTheme(d.theme, { preset: args.preset, colors: args.colors, fonts: args.fonts });
    });
    return `Theme is now "${design.theme.name}": ${Object.entries(design.theme.colors).map(([k, v]) => `${k} ${v}`).join(', ')}; heading font ${design.theme.fonts.heading}, body font ${design.theme.fonts.body}.`;
  },
});

export const createArtboardTool = defineTool({
  name: 'create_artboard',
  description: `Add an artboard (a slide, page or screen). Easiest: pick a layout and give content; Cellar positions everything. Add elements for anything extra, or skip the layout and place every element yourself. Layouts: ${LAYOUT_NAMES.join(', ')}.`,
  category: 'design',
  input: z.object({
    name: z.string().optional().describe('e.g. "Cover", "Pricing"'),
    size: z.string().optional().describe(`${Object.keys(ARTBOARD_PRESETS).join(', ')} or "WIDTHxHEIGHT" (default: the design's format)`),
    layout: z.string().optional(),
    content: contentSchema.optional(),
    background: z.string().optional().describe('Theme color name or hex'),
    elements: z.array(elementSchema).optional(),
    position: z.number().int().optional().describe('1-based position (default: last)'),
    copy_of: z.string().optional().describe('Duplicate this artboard (id or name) instead of starting empty'),
    notes: z.string().optional().describe('Speaker notes'),
  }),
  async run(args, ctx) {
    const errors: string[] = [];
    const { design, result } = updateDesign(designId(ctx), (d) => {
      if (d.artboards.length >= LIMITS.artboards) throw new ToolError(`A design can have at most ${LIMITS.artboards} artboards.`);
      let artboard: Artboard;
      if (args.copy_of) {
        artboard = duplicateArtboard(d, artboardOrThrow(d, args.copy_of, ctx), args.name);
      } else {
        const size = parseSize(args.size, FORMAT_DEFAULTS[d.format]?.preset ?? 'slide');
        artboard = { id: newArtboardId(d.artboards.map((a) => a.id)), name: args.name?.trim().slice(0, 80) || `${FORMAT_DEFAULTS[d.format]?.label ?? 'Artboard'} ${d.artboards.length + 1}`, width: size.width, height: size.height, background: 'background', elements: [] };
        const layout = layoutName(args.layout);
        if (args.layout && !layout) errors.push(`Unknown layout "${args.layout}", so no layout was applied. Layouts: ${layoutsFor(d.format).join(', ')}.`);
        if (layout) {
          const built = buildLayout(layout, layoutContent({ ...(args.content ?? {}), ...(args.content ? {} : pickContent(args as Record<string, unknown>)) }), size, d.theme, elementIds(d));
          artboard.elements = built.elements;
          if (built.background) artboard.background = built.background;
          errors.push(...built.errors);
        } else if (args.content && !args.elements?.length) {
          errors.push('content is only used with a layout; pass layout too, or place elements yourself.');
        }
      }
      if (args.background && normalizeColor(args.background)) artboard.background = normalizeColor(args.background)!;
      if (args.notes?.trim()) artboard.notes = args.notes.slice(0, 10_000);
      const at = args.position ? Math.max(0, Math.min(d.artboards.length, args.position - 1)) : d.artboards.length;
      d.artboards.splice(at, 0, artboard);
      addElements(d, artboard, args.elements, errors);
      return artboard.id;
    });
    const artboard = design.artboards.find((a) => a.id === result)!;
    return report(design, artboard, `Created artboard ${artboard.id} "${artboard.name}".`, errors);
  },
});

/** Content fields models sometimes put at the top level instead of inside `content`. */
function pickContent(args: Record<string, unknown>): Record<string, unknown> {
  const keys = ['title', 'subtitle', 'kicker', 'body', 'bullets', 'image', 'chart', 'quote', 'author', 'stats', 'columns', 'items', 'cta', 'footer'];
  return Object.fromEntries(keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]));
}

export const updateArtboardTool = defineTool({
  name: 'update_artboard',
  description: 'Change an artboard: rename it, resize it (elements scale along), change its background or notes, rebuild it from a layout, or replace all its elements.',
  category: 'design',
  input: z.object({
    artboard: z.string().describe('Artboard id, name or number'),
    name: z.string().optional(),
    size: z.string().optional().describe('Preset or "WIDTHxHEIGHT"'),
    background: z.string().optional(),
    notes: z.string().optional(),
    layout: z.string().optional().describe('Rebuild from this layout (replaces the elements)'),
    content: contentSchema.optional(),
    elements: z.array(elementSchema).optional().describe('Replace all elements with these'),
  }),
  async run(args, ctx) {
    const errors: string[] = [];
    const { design, result } = updateDesign(designId(ctx), (d) => {
      const artboard = artboardOrThrow(d, args.artboard, ctx);
      if (args.name?.trim()) artboard.name = args.name.trim().slice(0, 80);
      if (args.size) {
        const size = parseSize(args.size, 'slide');
        resizeArtboard(artboard, size.width, size.height, !args.layout && !args.elements);
      }
      if (args.background) {
        const color = normalizeColor(args.background);
        if (color) {
          artboard.background = color;
          delete artboard.gradient;
        } else errors.push(`"${args.background}" is not a color; use a theme color name or hex.`);
      }
      if (args.notes !== undefined) artboard.notes = args.notes.slice(0, 10_000) || undefined;
      const layout = layoutName(args.layout);
      if (args.layout && !layout) errors.push(`Unknown layout "${args.layout}". Layouts: ${LAYOUT_NAMES.join(', ')}.`);
      if (layout || args.elements) {
        const ids = elementIds(d);
        for (const e of artboard.elements) ids.delete(e.id);
        artboard.elements = [];
        if (layout) {
          const built = buildLayout(layout, layoutContent(args.content ?? {}), artboard, d.theme, ids);
          artboard.elements = built.elements;
          if (built.background && !args.background) artboard.background = built.background;
          errors.push(...built.errors);
        }
        addElements(d, artboard, args.elements, errors);
      }
      return artboard.id;
    });
    const artboard = design.artboards.find((a) => a.id === result)!;
    return report(design, artboard, `Updated artboard ${artboard.id}.`, errors);
  },
});

const ORDER: Record<string, OrderChange> = { front: 'front', top: 'front', back: 'back', bottom: 'back', forward: 'forward', up: 'forward', backward: 'backward', down: 'backward' };

export const editElementsTool = defineTool({
  name: 'edit_elements',
  description: 'Add, change, delete or reorder elements. Changes are partial: pass an element id with only the fields to change (e.g. {"id": "t2", "size": 40, "color": "accent"}).',
  category: 'design',
  input: z.object({
    artboard: z.string().optional().describe('Where to add new elements (id, name or number)'),
    add: z.array(elementSchema).optional(),
    update: z.array(z.looseObject({ id: z.string() }).describe('Element id plus the fields to change')).optional(),
    delete: z.array(z.string()).optional().describe('Element ids to remove'),
    order: z.array(z.object({ id: z.string(), to: z.string().describe('front, back, forward or backward') })).optional(),
  }),
  async run(args, ctx) {
    if (!args.add?.length && !args.update?.length && !args.delete?.length && !args.order?.length) throw new ToolError('Nothing to do: pass add, update, delete or order.');
    const errors: string[] = [];
    const lines: string[] = [];
    const touched = new Set<string>();
    const { design } = updateDesign(designId(ctx), (d) => {
      for (const change of args.update ?? []) {
        const found = findElement(d, String(change.id));
        if (!found) {
          errors.push(`No element "${change.id}".`);
          continue;
        }
        const fields = canonicalFields(change as Record<string, unknown>);
        const { element, error } = patchElement(found.element, fields, { width: found.artboard.width, height: found.artboard.height, theme: d.theme, ids: elementIds(d) });
        if (!element) {
          errors.push(`${change.id}: ${error}`);
          continue;
        }
        found.artboard.elements[found.index] = element;
        touched.add(found.artboard.id);
        lines.push(`Changed ${describeElement(element)}`);
      }
      for (const id of args.delete ?? []) {
        const found = findElement(d, id);
        if (!found) {
          errors.push(`No element "${id}" to delete.`);
          continue;
        }
        found.artboard.elements.splice(found.index, 1);
        touched.add(found.artboard.id);
        lines.push(`Deleted ${id}`);
      }
      if (args.add?.length) {
        const artboard = artboardOrThrow(d, args.artboard, ctx);
        for (const el of addElements(d, artboard, args.add, errors)) lines.push(`Added ${describeElement(el)}`);
        touched.add(artboard.id);
      }
      for (const item of args.order ?? []) {
        const found = findElement(d, item.id);
        const to = ORDER[item.to.toLowerCase()];
        if (!found || !to) {
          errors.push(!found ? `No element "${item.id}".` : `Order "${item.to}" must be front, back, forward or backward.`);
          continue;
        }
        reorderElement(found.artboard, item.id, to);
        touched.add(found.artboard.id);
        lines.push(`Moved ${item.id} ${to === 'front' || to === 'back' ? `to the ${to}` : to}`);
      }
    });
    const problems = [...touched].flatMap((id) => {
      const artboard = design.artboards.find((a) => a.id === id);
      return artboard ? checkArtboard(artboard, design.theme).map((p) => `${artboard.id}: ${p}`) : [];
    });
    return [
      ...lines,
      ...errors.map((e) => `Error: ${e}`),
      problems.length ? `Layout problems to fix:\n${problems.map((p) => `- ${p}`).join('\n')}` : touched.size ? 'Layout check: no overlapping or overflowing text found.' : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
});

export const deleteArtboardTool = defineTool({
  name: 'delete_artboard',
  description: 'Remove an artboard and everything on it.',
  category: 'design',
  input: z.object({ artboard: z.string().describe('Artboard id, name or number') }),
  async run(args, ctx) {
    let removed = '';
    const { design } = updateDesign(designId(ctx), (d) => {
      const artboard = artboardOrThrow(d, args.artboard, ctx);
      removed = `${artboard.id} "${artboard.name}"`;
      d.artboards = d.artboards.filter((a) => a.id !== artboard.id);
    });
    return `Deleted artboard ${removed}. ${design.artboards.length} artboard${design.artboards.length === 1 ? '' : 's'} left.`;
  },
});

export const DESIGN_TOOLS: AgentTool[] = [getDesignTool, setThemeTool, createArtboardTool, updateArtboardTool, editElementsTool, deleteArtboardTool] as AgentTool[];
