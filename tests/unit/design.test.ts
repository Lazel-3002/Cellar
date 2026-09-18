import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chartSvg, normalizeChart, CHART_KINDS } from '../../src/shared/design/charts';
import { checkArtboard } from '../../src/shared/design/check';
import { LAYOUT_NAMES, layoutContent } from '../../src/shared/design/layouts';
import { normalizeArtboard, normalizeDesign, normalizeElement, patchElement } from '../../src/shared/design/normalize';
import { buildLayout, describeElement, resizeArtboard } from '../../src/shared/design/ops';
import { designHtml, imageStyle } from '../../src/shared/design/render';
import { sanitizeSvg } from '../../src/shared/design/svg';
import { ARTBOARD_PRESETS, customizeTheme, parseSize, resolveColor, THEMES } from '../../src/shared/design/theme';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { Artboard, ImageElement, TextElement } from '../../src/shared/types/design';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-design-home-${process.pid}`);

// `design/export.ts` imports Electron for its offline-render pipeline; only its pure helpers are exercised here.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  nativeImage: {},
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  session: { fromPartition: () => ({ webRequest: { onBeforeRequest: () => undefined } }) },
}));

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { designForConversation, listVersions, renameVersion, restoreVersion, saveDesign, updateDesign } = await import('../../src/main/design/store');
const { artboardsToPptx } = await import('../../src/main/design/pptx');
const { imageDimensions } = await import('../../src/main/design/images');
const { addFontFile, fontFaceCss, listFonts, removeFont } = await import('../../src/main/design/fonts');
const { usedFontFamilies } = await import('../../src/main/design/export');
const documents = await import('../../src/main/agent/documents');
const { createPdf } = await import('../../src/main/agent/tools/plan-docs');
const { Workspace } = await import('../../src/main/agent/workspace');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;

const theme = THEMES.find((t) => t.id === 'corporate')!;
const slide = { width: 1920, height: 1080, theme, ids: new Set<string>() };

/** A solid-color PNG. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x55)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

describe('design model', () => {
  it('normalizes loose element input from models', () => {
    const ctx = { ...slide, ids: new Set<string>() };
    const title = normalizeElement({ type: 'heading', content: 'Q3 **review**', fontSize: '72px', fontWeight: 'bold', x: 'center', top: '10%', width: 1200, textColor: 'brand' }, ctx).element as TextElement;
    expect(title).toMatchObject({ id: 't1', type: 'text', text: 'Q3 **review**', size: 72, weight: 700, w: 1200, x: 360, y: 108, color: 'primary' });
    expect(title.h).toBeGreaterThan(72);
    const box = normalizeElement({ type: 'rectangle', left: 0, top: 0, width: '100%', height: 40, backgroundColor: '#ff0000', borderRadius: 8 }, ctx).element!;
    expect(box).toMatchObject({ id: 'r1', type: 'rect', w: 1920, h: 40, fill: '#FF0000', radius: 8 });
    const chart = normalizeElement({ type: 'chart', chart_type: 'line', data: { labels: ['A', 'B'], datasets: [{ label: 'Sales', data: ['3', 5] }] } }, ctx).element!;
    expect(chart).toMatchObject({ type: 'chart', chart: { kind: 'line', labels: ['A', 'B'], series: [{ name: 'Sales', values: [3, 5] }] } });
    expect(normalizeElement({ type: 'sticker' }, ctx).error).toMatch(/Unknown element type/);
    expect(normalizeElement({ type: 'image', src: 'https://example.com/x.png' }, ctx).element).toMatchObject({ src: '' });

    const bigger = patchElement(title, { size: 120 }, ctx).element as TextElement;
    expect(bigger).toMatchObject({ id: 't1', size: 120, x: 360 });
    expect(bigger.h).toBeGreaterThan(title.h);
  });

  it('builds every layout inside the artboard for slides, pages and phones', () => {
    const content = layoutContent({
      title: 'Local models for everyone',
      subtitle: 'Private by default',
      kicker: 'Cellar',
      bullets: ['Runs on your GPU', 'Works offline', 'No account needed'],
      stats: [{ value: '143', label: 'tokens per second' }, { value: '0', label: 'bytes sent' }],
      items: [{ title: 'Chat', body: 'Streaming answers' }, { title: 'Cowork', body: 'Agents in a folder' }, { title: 'Design', body: 'Canvas' }],
      chart: { type: 'bar', labels: ['A', 'B'], series: [{ name: 'x', values: [1, 2] }] },
      quote: 'It just works.',
      author: 'A user',
      cta: 'Download',
      footer: 'September 2026',
    });
    for (const size of [ARTBOARD_PRESETS.slide, ARTBOARD_PRESETS.a4, ARTBOARD_PRESETS.mobile]) {
      for (const layout of LAYOUT_NAMES) {
        const built = buildLayout(layout, content, size, theme, new Set());
        expect(built.errors, `${layout} ${size.label}`).toEqual([]);
        const artboard: Artboard = { id: 'a1', name: layout, width: size.width, height: size.height, background: built.background ?? 'background', elements: built.elements };
        const problems = checkArtboard(artboard, theme).filter((p) => /outside|extends past|overlap/.test(p));
        expect(problems, `${layout} on ${size.label}`).toEqual([]);
      }
    }
    // Missing content is left out rather than filled with placeholder copy.
    for (const layout of LAYOUT_NAMES) {
      const empty = buildLayout(layout, layoutContent({}), ARTBOARD_PRESETS.slide, theme, new Set());
      expect(empty.elements.filter((e) => e.type === 'text' && /Title|Headline|point|Details/.test(e.text)), layout).toEqual([]);
    }
  });

  it('reports layout problems and scales artboards', () => {
    const ctx = { ...slide, ids: new Set<string>() };
    const long = normalizeElement({ type: 'text', text: 'word '.repeat(120), x: 100, y: 100, w: 300, h: 60, size: 40 }, ctx).element!;
    const other = normalizeElement({ type: 'text', text: 'Overlap', x: 110, y: 110, w: 280, size: 40 }, ctx).element!;
    const pale = normalizeElement({ type: 'text', text: 'Faint', x: 1000, y: 900, w: 300, size: 40, color: '#F8FAFC' }, ctx).element!;
    const artboard: Artboard = { id: 'a1', name: 'Test', width: 1920, height: 1080, background: 'background', elements: [long, other, pale] };
    const problems = checkArtboard(artboard, theme).join('\n');
    expect(problems).toContain('t1 ("word word');
    expect(problems).toMatch(/needs about \d+px of height/);
    expect(problems).toContain('t1 and t2 overlap');
    expect(problems).toContain('t3 ("Faint") has low contrast');
    resizeArtboard(artboard, 960, 540);
    expect(artboard.elements[0]).toMatchObject({ x: 50, y: 50, w: 150, size: 20 });
  });

  it('validates a Present transition on an artboard, dropping anything unrecognized', () => {
    const withTransition = normalizeArtboard({ name: 'One', size: 'slide', transition: 'Slide Left' }, theme, new Set(), new Set());
    expect(withTransition.transition).toBe('slide-left');
    const noTransition = normalizeArtboard({ name: 'Two', size: 'slide' }, theme, new Set(), new Set());
    expect(noTransition.transition).toBeUndefined();
    const bogus = normalizeArtboard({ name: 'Three', size: 'slide', transition: 'zoom-blur' }, theme, new Set(), new Set());
    expect(bogus.transition).toBeUndefined();
  });

  it('clamps image crop and filters, and renders them as CSS', () => {
    const ctx = { ...slide, ids: new Set<string>() };
    const cropped = normalizeElement({ type: 'image', src: 'attachment:abcd1234', crop: { x: 120, y: -10, w: 150, h: 40 } }, ctx).element as ImageElement;
    // x/y/w are percentages over 1 so they're read as 0-100, then clamped so the rect stays inside the image.
    expect(cropped.crop).toEqual({ x: 0, y: 0, w: 1, h: 0.4 });

    const filtered = normalizeElement({ type: 'image', src: 'attachment:abcd1234', filters: { brightness: 120, contrast: 0.8, saturate: -1 } }, ctx).element as ImageElement;
    expect(filtered.filters).toEqual({ brightness: 1.2, contrast: 0.8, saturate: 0 });

    const plain = normalizeElement({ type: 'image', src: 'attachment:abcd1234' }, ctx).element as ImageElement;
    expect(plain.crop).toBeUndefined();
    expect(plain.filters).toBeUndefined();

    // The frame's <img> is pre-scaled/shifted to make the crop rect fill it exactly, instead of using object-fit.
    const style = imageStyle({ ...plain, crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.6 } });
    expect(style).toMatchObject({ position: 'absolute', width: '200%', height: `${Math.round((100 / 0.6) * 1000) / 1000}%`, left: '-50%' });
    expect(imageStyle(plain)).toMatchObject({ width: '100%', height: '100%', objectFit: 'cover' });
    expect(imageStyle({ ...plain, filters: { brightness: 1.2, saturate: 1 } }).filter).toBe('brightness(1.2)');
  });

  it('makes any element a clickable hotspot, in the tool report and in html/pdf exports (never png)', () => {
    const ctx = { ...slide, ids: new Set<string>() };
    const toArtboard = normalizeElement({ type: 'text', text: 'Next', link: { kind: 'artboard', artboard: 'a2' } }, ctx).element!;
    expect(toArtboard.link).toEqual({ kind: 'artboard', artboard: 'a2' });
    expect(describeElement(toArtboard)).toContain('→ links to a2');

    const toUrl = normalizeElement({ type: 'rect', href: 'https://example.com' }, ctx).element!;
    expect(toUrl.link).toEqual({ kind: 'url', url: 'https://example.com' });
    expect(describeElement(toUrl)).toContain('→ opens https://example.com');

    expect(normalizeElement({ type: 'text', text: 'x', link: { kind: 'bogus' } }, ctx).element!.link).toBeUndefined();
    expect(normalizeElement({ type: 'text', text: 'x', link: {} }, ctx).element!.link).toBeUndefined();
    // Clearing a link on an update.
    const cleared = patchElement(toArtboard, { link: null }, ctx).element!;
    expect(cleared.link).toBeUndefined();

    const design = normalizeDesign(
      {
        title: 'Prototype',
        theme,
        artboards: [
          { name: 'Home', id: 'a1', size: 'slide', elements: [{ type: 'text', text: 'Next', x: 10, y: 10, w: 200, link: { kind: 'artboard', artboard: 'a2' } }] },
          { name: 'Second', id: 'a2', size: 'slide', elements: [{ type: 'rect', x: 10, y: 10, w: 100, h: 40, href: 'https://cellar.local' }] },
        ],
      },
      { id: 'd1', conversationId: 'c1', createdAt: 0 },
    );
    const html = designHtml(design, undefined, { mode: 'html', imageUrl: () => '' });
    expect(html).toContain('<a href="#a2" style="text-decoration:none;color:inherit">');
    expect(html).toContain('<a href="https://cellar.local" style="text-decoration:none;color:inherit" target="_blank" rel="noopener noreferrer">');
    const pdf = designHtml(design, undefined, { mode: 'pdf', imageUrl: () => '' });
    expect(pdf).toContain('href="#a2"');
    const png = designHtml(design, ['a1'], { mode: 'png', imageUrl: () => '' });
    expect(png).not.toContain('<a href');
  });

  it('renders charts, cleans SVG and builds export HTML', () => {
    for (const kind of CHART_KINDS) {
      const svg = chartSvg(normalizeChart({ type: kind, title: 'Sales <2026>', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'EU', values: [3, 7, 5] }, { name: 'US', values: [4, 2, 6] }], values: true }), 800, 450, { theme });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('Sales &lt;2026&gt;');
      expect(svg).not.toContain('NaN');
    }
    const clean = sanitizeSvg('<?xml version="1.0"?><svg width="24" height="24" onload="alert(1)"><script>alert(2)</script><image href="https://evil.test/x.png"/><circle cx="12" cy="12" r="10" fill="url(https://evil.test/#p)"/></svg>')!;
    expect(clean).toContain('viewBox="0 0 24 24"');
    expect(clean).not.toMatch(/onload|script|evil\.test/);
    expect(sanitizeSvg('<div>no svg</div>')).toBeNull();

    const design = normalizeDesign({ title: 'Deck', theme, artboards: [{ name: 'One', size: 'slide', elements: [{ type: 'text', text: 'Hello <world>', x: 10, y: 10, w: 500 }] }, { name: 'Two', size: 'a4', elements: [] }] }, { id: 'd1', conversationId: 'c1', createdAt: 0 });
    const html = designHtml(design, undefined, { mode: 'pdf', imageUrl: () => '' });
    expect(html).toContain('@page p0{size:1920px 1080px;margin:0}');
    expect(html).toContain('@page p1{size:794px 1123px;margin:0}');
    expect(html).toContain('Hello &lt;world&gt;');
    expect(parseSize('1280x720')).toEqual({ width: 1280, height: 720 });
    expect(parseSize('A4')).toEqual({ width: 794, height: 1123 });
    const custom = customizeTheme(theme, { colors: { primary: '#0f766e', brand: 'red' }, fonts: { heading: 'Georgia' } });
    expect(resolveColor('primary', custom)).toBe('#E53935');
    expect(custom).toMatchObject({ id: 'custom', fonts: { heading: 'Georgia', body: 'Segoe UI' } });
  });

  it('exports artboards to PowerPoint with editable text, native charts and images', async () => {
    const ctx = { ...slide, ids: new Set<string>() };
    const built = buildLayout('chart', layoutContent({ title: 'Revenue by quarter', bullets: ['Up 40%'], chart: { type: 'bar', labels: ['Q1', 'Q2'], series: [{ name: 'Revenue', values: [10, 14] }] } }), slide, theme, ctx.ids);
    const image = normalizeElement({ type: 'image', src: 'asset:logo', x: 1700, y: 40, w: 160, h: 80, href: 'https://example.com/report' }, ctx).element!;
    const cropped = normalizeElement({ type: 'image', src: 'asset:photo', x: 100, y: 700, w: 300, h: 200, crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.6 } }, ctx).element!;
    const next = normalizeElement({ type: 'text', text: 'Details', x: 100, y: 900, w: 300, link: { kind: 'artboard', artboard: 'a2' } }, ctx).element!;
    const artboards: Artboard[] = [
      { id: 'a1', name: 'Revenue', width: 1920, height: 1080, background: 'background', elements: [...built.elements, image, cropped, next], notes: 'Mention the new region' },
      { id: 'a2', name: 'Details', width: 1920, height: 1080, background: 'background', elements: [] },
    ];
    const logo = png(40, 20);
    const photo = png(400, 300);
    const bytes = await artboardsToPptx(artboards, theme, { title: 'Test' }, {
      image: async (src) => (src === 'asset:logo' ? { mime: 'image/png', bytes: logo, width: 40, height: 20 } : src === 'asset:photo' ? { mime: 'image/png', bytes: photo, width: 400, height: 300 } : null),
    });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/'))).toBe(true);
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slideXml).toContain('Revenue by quarter');
    expect(slideXml).toContain('Bahnschrift');
    expect(imageDimensions(logo)).toEqual({ width: 40, height: 20 });

    // A crop {x:0.25, y:0.1, w:0.5, h:0.6} is a native PowerPoint <a:srcRect> at the same fractions, in hundred-thousandths.
    // The cropped image is the last <p:pic>, so its <a:srcRect> is the last of the two (the logo's plain "cover" fit emits one too).
    const srcRects = [...slideXml.matchAll(/<a:srcRect l="(-?\d+)" r="(-?\d+)" t="(-?\d+)" b="(-?\d+)"\/>/g)];
    expect(srcRects).toHaveLength(2);
    expect(srcRects.at(-1)!.slice(1).map(Number)).toEqual([25000, 25000, 10000, 30000]);

    // A link becomes a real PowerPoint hyperlink: a same-deck artboard link jumps to that slide, a URL opens externally.
    expect(slideXml).toContain('action="ppaction://hlinksldjump"');
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string');
    expect(rels).toContain('Target="https://example.com/report"');
    expect(rels).toMatch(/Target="slide2\.xml"/);
  });
});

describe('design sessions', () => {
  class FakeProvider {
    readonly id = 'fake';
    readonly kind = 'openai' as const;
    readonly name = 'Fake';
    readonly canManageModels = false;
    readonly canDownload = false;
    requests: ChatRequest[] = [];
    script: (req: ChatRequest) => StreamEvent[] = () => [{ type: 'text', delta: 'ok' }];
    async status(): Promise<ProviderStatus> {
      return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
    }
    async listModels(): Promise<ModelEntry[]> {
      return [];
    }
    async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
      this.requests.push(req);
      for (const event of this.script(req)) yield event;
      yield { type: 'done', stopReason: 'stop' };
    }
  }
  const fake = new FakeProvider();
  const entry: ModelEntry = {
    ref: { providerId: 'fake', modelId: 'designer' },
    providerKind: 'openai',
    providerName: 'Fake',
    displayName: 'Fake Designer',
    contextLength: 32768,
    capabilities: { vision: false, tools: true, reasoning: false, embedding: false },
    reasoningStyle: 'none',
    loaded: true,
  };
  let userData: string;
  const call = (name: string, args: unknown): StreamEvent => ({ type: 'tool_call', id: `c${Math.random()}`, name, argumentsDelta: JSON.stringify(args) });
  /** Tool results since the latest user message. */
  const toolResults = (req: ChatRequest) => req.messages.slice(req.messages.map((m) => m.role).lastIndexOf('user')).filter((m) => m.role === 'tool').map((m) => m.content);

  async function finished(conversationId: string, messageId: string) {
    for (let i = 0; i < 500; i++) {
      const m = chat.getConversation(conversationId).messages.find((x) => x.id === messageId)!;
      if (m.status !== 'streaming') return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timed out');
  }

  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'cellar-design-data-'));
    initPaths(userData, userData);
    closeDatabase();
    openDatabase(':memory:');
    settings.update({ autoTitle: false, coworkNotifications: false });
    (providers as unknown as { get: () => FakeProvider }).get = () => fake;
    (providers as unknown as { findModel: () => Promise<ModelEntry> }).findModel = async () => entry;
  });

  afterAll(async () => {
    chat.stopAll();
    await rm(userData, { recursive: true, force: true }).catch(() => undefined);
    await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
  });

  it('builds a design through the agent loop and sees the canvas and selection next turn', async () => {
    fake.script = (req) => {
      const results = toolResults(req);
      if (results.length === 0)
        return [
          { type: 'text', delta: 'Setting up the deck.' },
          call('set_theme', { preset: 'midnight', colors: { accent: '#FF8800' } }),
          call('create_artboard', { name: 'Cover', layout: 'title', content: { title: 'Bean Club', subtitle: 'Coffee, delivered' } }),
        ];
      if (results.length === 2) return [call('create_artboard', { name: 'Numbers', layout: 'stats', content: { title: 'Traction', stats: [{ value: '1,200', label: 'members' }] }, elements: [{ type: 'circle', x: 1700, y: 60, width: 120, fill: 'accent' }] })];
      return [{ type: 'text', delta: 'Made a two-slide deck.' }];
    };
    const first = await chat.send({ content: 'Pitch deck for Bean Club', attachmentIds: [], model: entry.ref, thinking: 'off', design: { format: 'slides', themeId: 'paper' } });
    const done = await finished(first.conversationId, first.assistantMessageId);
    expect(done.status).toBe('complete');
    const conversation = chat.getConversation(first.conversationId).conversation;
    expect(conversation.kind).toBe('design');
    const design = designForConversation(first.conversationId)!;
    expect(design.theme).toMatchObject({ id: 'custom', colors: { accent: '#FF8800' } });
    expect(design.artboards.map((a) => [a.name, a.width])).toEqual([
      ['Cover', 1920],
      ['Numbers', 1920],
    ]);
    expect(design.artboards[1].elements.some((e) => e.type === 'ellipse' && e.fill === 'accent')).toBe(true);
    expect(fake.requests[0].tools?.map((t) => t.name)).toEqual(expect.arrayContaining(['get_design', 'set_theme', 'create_artboard', 'update_artboard', 'edit_elements', 'delete_artboard']));
    expect(fake.requests[0].tools?.map((t) => t.name)).not.toContain('write_file');
    expect(toolResults(fake.requests[1])[1]).toMatch(/Created artboard a1 "Cover"[\s\S]*Layout check/);
    // The next model call sees the updated design in its prompt.
    expect(fake.requests[2].messages[0].content).toContain('"Numbers" 1920×1080');

    const title = design.artboards[0].elements.find((e) => e.type === 'text' && e.text === 'Bean Club')!;
    fake.requests = [];
    fake.script = (req) => (toolResults(req).length === 0 ? [call('edit_elements', { update: [{ id: title.id, size: 150, color: 'accent' }], delete: ['nope'] })] : [{ type: 'text', delta: 'Bigger now.' }]);
    const second = await chat.send({ conversationId: first.conversationId, content: 'Make this bigger', attachmentIds: [], model: entry.ref, thinking: 'off', designSelection: { artboardId: 'a1', elementIds: [title.id] } });
    await finished(first.conversationId, second.assistantMessageId);
    expect(fake.requests[0].messages[0].content).toContain(`The user has selected ${title.id} on artboard a1 "Cover"`);
    expect(toolResults(fake.requests[1])[0]).toContain('Error: No element "nope"');
    const edited = designForConversation(first.conversationId)!;
    expect(edited.artboards[0].elements.find((e) => e.id === title.id)).toMatchObject({ size: 150, color: 'accent' });

    // Saves from the editor must be based on the latest version.
    expect(() => saveDesign({ ...edited, artboards: [] }, edited.version - 1)).toThrow(/changed while you were editing/);
    const saved = saveDesign({ ...edited, artboards: edited.artboards.slice(0, 1) }, edited.version);
    expect(saved.version).toBe(edited.version + 1);
    expect(designForConversation(first.conversationId)!.artboards).toHaveLength(1);
  });

  it('creates blank designs and duplicates them', async () => {
    const { conversationId } = await chat.createDesign({ format: 'poster', themeId: 'pop', title: 'Gig poster' });
    const design = designForConversation(conversationId)!;
    expect(design).toMatchObject({ title: 'Gig poster', format: 'poster', theme: { id: 'pop' }, artboards: [] });
    saveDesign({ ...design, artboards: [{ id: 'a1', name: 'Poster', width: 1123, height: 1587, background: 'background', elements: [] }] }, design.version);
    const copy = await chat.duplicateDesign(conversationId);
    expect(designForConversation(copy.conversationId)).toMatchObject({ title: 'Gig poster (copy)', artboards: [{ name: 'Poster' }] });
  });

  it('records a version on every save, from both the agent and the user path', async () => {
    const { designId } = await chat.createDesign({ format: 'slides', themeId: 'paper', title: 'History test' });
    expect(listVersions(designId)).toEqual([]); // creating a blank design isn't itself a "save"

    const { design: afterAgent } = updateDesign(designId, (d) => {
      d.artboards.push({ id: 'a1', name: 'One', width: 1920, height: 1080, background: 'background', elements: [] });
    });
    let versions = listVersions(designId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: afterAgent.version, source: 'agent', name: null });

    const afterUser = saveDesign({ ...afterAgent, artboards: [] }, afterAgent.version);
    versions = listVersions(designId);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ version: afterUser.version, source: 'user' });
    expect(versions[1]).toMatchObject({ version: afterAgent.version, source: 'agent' });
  });

  it('restores an old snapshot as a new version, leaves history untouched, and keeps optimistic concurrency', async () => {
    const { conversationId, designId } = await chat.createDesign({ format: 'poster', themeId: 'pop', title: 'Restore test' });
    const withBoard = saveDesign({ ...designForConversation(conversationId)!, artboards: [{ id: 'a1', name: 'Poster', width: 1123, height: 1587, background: 'background', elements: [] }] }, designForConversation(conversationId)!.version);
    const blanked = saveDesign({ ...withBoard, artboards: [] }, withBoard.version);
    expect(blanked.artboards).toEqual([]);

    const targetVersion = listVersions(designId).find((v) => v.version === withBoard.version)!;
    const restored = restoreVersion(designId, targetVersion.id);
    expect(restored.version).toBe(blanked.version + 1);
    expect(restored.artboards).toMatchObject([{ name: 'Poster' }]);

    // Append-only: restoring never rewrites the row it restored from, it only adds a new latest one.
    const versionsAfter = listVersions(designId);
    expect(versionsAfter[0]).toMatchObject({ version: restored.version, source: 'user' });
    expect(versionsAfter.some((v) => v.version === withBoard.version)).toBe(true);

    // Restoring is a normal save: it goes through the same version check as any other.
    expect(() => saveDesign({ ...restored, artboards: [] }, restored.version - 1)).toThrow(/changed while you were editing/);
    expect(() => restoreVersion(designId, 'nope')).toThrow(/gone/);
  });

  it('labels a saved version, or clears its label', async () => {
    const { conversationId, designId } = await chat.createDesign({ format: 'document', themeId: 'academic', title: 'Rename test' });
    saveDesign({ ...designForConversation(conversationId)!, title: 'Rename test' }, designForConversation(conversationId)!.version);
    const [version] = listVersions(designId);
    renameVersion(designId, version.id, 'Before the redesign');
    expect(listVersions(designId)[0]).toMatchObject({ name: 'Before the redesign' });
    renameVersion(designId, version.id, '   ');
    expect(listVersions(designId)[0].name).toBeNull();
    expect(() => renameVersion(designId, 'nope', 'x')).toThrow(/gone/);
  });
});

describe('custom fonts', () => {
  it('sniffs font files by magic bytes and rejects anything else', () => {
    const otf = Buffer.concat([Buffer.from('OTTO', 'latin1'), Buffer.alloc(20)]);
    const ttf = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.alloc(20)]);
    const woff = Buffer.concat([Buffer.from('wOFF', 'latin1'), Buffer.alloc(20)]);
    const woff2 = Buffer.concat([Buffer.from('wOF2', 'latin1'), Buffer.alloc(20)]);
    const bogus = Buffer.concat([Buffer.from('NOPE', 'latin1'), Buffer.alloc(20)]);

    expect(addFontFile('display.otf', otf)).toMatchObject({ family: 'display', source: 'upload' });
    expect(addFontFile('Body_Text.ttf', ttf)).toMatchObject({ family: 'Body Text' });
    expect(addFontFile('mono.woff', woff)).toMatchObject({ family: 'mono' });
    expect(addFontFile('script.woff2', woff2)).toMatchObject({ family: 'script' });
    expect(() => addFontFile('fake.ttf', bogus)).toThrow(/does not look like a font/);
    expect(() => addFontFile('display.otf', otf)).toThrow(/already imported/);

    expect(listFonts().map((f) => f.family).sort()).toEqual(['Body Text', 'display', 'mono', 'script']);
  });

  it('builds @font-face rules only for the families a design actually uses, as offline data URLs', () => {
    const ttf = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.alloc(20)]);
    addFontFile('Recoleta.ttf', ttf);
    const design = normalizeDesign(
      { title: 'Deck', theme: { id: 'corporate', name: 'Minimal corporate', fonts: { heading: 'Recoleta', body: 'Segoe UI' } }, artboards: [{ name: 'One', size: 'slide', elements: [] }] },
      { id: 'd1', conversationId: 'c1', createdAt: 0 },
    );
    expect(usedFontFamilies(design).sort()).toEqual(['Recoleta', 'Segoe UI']);

    const fontFaces = fontFaceCss(usedFontFamilies(design));
    expect(fontFaces).toContain("@font-face{font-family:'Recoleta'");
    expect(fontFaces).toContain("format('truetype')");
    expect(fontFaces).toContain('data:font/ttf;base64,');
    expect(fontFaces).not.toContain('Segoe UI'); // a built-in system font, never imported, so nothing to embed

    const html = designHtml(design, undefined, { mode: 'html', imageUrl: () => '', fontFaces });
    expect(html).toContain(fontFaces);

    const [font] = listFonts().filter((f) => f.family === 'Recoleta');
    removeFont(font.id);
    expect(fontFaceCss(['Recoleta'])).toBe('');
    expect(() => removeFont(font.id)).toThrow(/gone/);
  });
});

describe('designed documents', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cellar-docs-'));
    await writeFile(join(root, 'photo.png'), png(64, 32));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('styles PDFs with a theme and draws ```chart blocks and images inline', () => {
    const md = '# Report\n\n## Growth\n\n```chart\n{"type": "donut", "labels": ["A", "B"], "series": [{"name": "Share", "values": [60, 40]}]}\n```\n\n![Team](photo.png)\n\n```js\nconsole.log(1)\n```';
    const image = { mime: 'image/png', bytes: png(4, 4), width: 4, height: 4 };
    const html = documents.markdownToHtmlPage(md, 'Report', { theme: THEMES.find((t) => t.id === 'academic'), images: new Map([['photo.png', image]]) });
    expect(html).toContain('<figure><svg');
    expect(html).toContain('Palatino Linotype');
    expect(html).toContain('background: #F6F0E4');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain('console.log(1)');
    expect(documents.markdownToHtmlPage('Some *text*', 'Title')).toContain('<h1 class="doc-title">Title</h1>');
  });

  it('writes themed Word files with pictures and chart data', async () => {
    const md = '# Plan\n\nIntro with ![logo](photo.png)\n\n```chart\n{"type": "bar", "labels": ["Jan", "Feb"], "series": [{"name": "Visits", "values": [120, 180]}]}\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
    const bytes = await documents.markdownToDocx(md, 'Plan', { theme: THEMES.find((t) => t.id === 'forest'), image: async () => ({ mime: 'image/png', bytes: png(64, 32), width: 64, height: 32 }) });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Visits');
    expect(xml).toContain('180');
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toContain('Candara');
    expect(styles).toContain('2F6B3F');
  });

  it('builds slides from layouts and keeps document images inside the working folder', async () => {
    const bytes = await documents.createPptx(
      [
        { title: 'Quarterly review', subtitle: 'Q3 2026' },
        { layout: 'stats', title: 'Numbers', stats: [{ value: '42%', label: 'growth' }] },
        { layout: 'image-right', title: 'Our team', body: 'Small and focused', image: 'photo.png' },
        { title: 'Next steps', bullets: ['Hire', 'Ship'], elements: [{ type: 'text', text: 'Confidential', x: 1500, y: 1000, w: 300, size: 20 }] },
      ],
      'Review',
      { theme, image: async (href) => (href === 'photo.png' ? { mime: 'image/png', bytes: png(64, 32), width: 64, height: 32 } : null) },
    );
    const file = join(root, 'deck.pptx');
    await writeFile(file, bytes);
    const text = await documents.extractDocumentText(file);
    expect(text).toContain('Quarterly review');
    expect(text).toContain('42%');
    expect(text).toContain('Confidential');
    expect(Object.keys((await JSZip.loadAsync(bytes)).files).some((f) => f.startsWith('ppt/media/'))).toBe(true);

    let rendered = '';
    documents.setPdfRenderer(async (html) => {
      rendered = html;
      return Buffer.from('%PDF-1.4');
    });
    try {
      const workspace = await Workspace.open(root);
      const task = { folder: root, workDir: root, permissionMode: 'auto-edits' as const, status: 'running' as const, todos: [], files: [], sources: [], allowCommands: false, allowedDomains: [], steps: 0, maxSteps: 40 };
      const ctx = { workspace, task, settings: settings.get(), signal: new AbortController().signal, maxResultChars: 20_000, knownUrls: new Set<string>(), recordFile: () => undefined, recordSource: () => undefined, setTodos: () => undefined };
      await createPdf.run({ path: 'report.pdf', markdown: '# Hi\n\n![ok](photo.png)\n\n![escape](../outside.png)', theme: 'scifi' }, ctx as never);
      expect(rendered).toContain('data:image/png;base64,');
      expect(rendered).toContain('[escape]');
      expect(rendered).toContain('#070B18');
    } finally {
      documents.setPdfRenderer(null);
    }
  });
});
