import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chartSvg, normalizeChart, CHART_KINDS } from '../../src/shared/design/charts';
import { checkArtboard } from '../../src/shared/design/check';
import { LAYOUT_NAMES, layoutContent } from '../../src/shared/design/layouts';
import { normalizeDesign, normalizeElement, patchElement } from '../../src/shared/design/normalize';
import { buildLayout, resizeArtboard } from '../../src/shared/design/ops';
import { designHtml } from '../../src/shared/design/render';
import { sanitizeSvg } from '../../src/shared/design/svg';
import { ARTBOARD_PRESETS, customizeTheme, parseSize, resolveColor, THEMES } from '../../src/shared/design/theme';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { Artboard, TextElement } from '../../src/shared/types/design';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-design-home-${process.pid}`);

const { initPaths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const { designForConversation, saveDesign } = await import('../../src/main/design/store');
const { artboardsToPptx } = await import('../../src/main/design/pptx');
const { imageDimensions } = await import('../../src/main/design/images');
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
    const image = normalizeElement({ type: 'image', src: 'asset:logo', x: 1700, y: 40, w: 160, h: 80 }, ctx).element!;
    const artboards: Artboard[] = [{ id: 'a1', name: 'Revenue', width: 1920, height: 1080, background: 'background', elements: [...built.elements, image], notes: 'Mention the new region' }];
    const logo = png(40, 20);
    const bytes = await artboardsToPptx(artboards, theme, { title: 'Test' }, { image: async (src) => (src === 'asset:logo' ? { mime: 'image/png', bytes: logo, width: 40, height: 20 } : null) });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/'))).toBe(true);
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slideXml).toContain('Revenue by quarter');
    expect(slideXml).toContain('Bahnschrift');
    expect(imageDimensions(logo)).toEqual({ width: 40, height: 20 });
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
