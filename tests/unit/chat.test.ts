import { describe, expect, it } from 'vitest';
import { parseArtifacts, parseInfoString } from '../../src/shared/artifacts';
import { parseImageTags, withImageTags } from '../../src/shared/inline-images';
import { branchPath, latestLeaf, siblingsOf } from '../../src/shared/message-tree';
import type { Message } from '../../src/shared/types/chat';
import { parseVizBlocks } from '../../src/shared/viz';
import { fitToContext, truncateMiddle } from '../../src/main/chat/context-window';
import { buildSystemPrompt, cleanTitle, fallbackTitle, parseParamsBillions, supportsArtifactInstructions } from '../../src/main/chat/prompts';
import type { ProviderMessage } from '../../src/main/providers/types';

const msg = (id: string, parentId: string | null, role: Message['role'], createdAt: number): Message => ({
  id,
  conversationId: 'c',
  parentId,
  role,
  content: id,
  attachments: [],
  status: 'complete',
  createdAt,
});

describe('message tree', () => {
  // u1 → a1, a1b (regenerated) ; a1 → u2 → a2 ; u1 edited as u1b → a3
  const messages = [
    msg('u1', null, 'user', 1),
    msg('a1', 'u1', 'assistant', 2),
    msg('u2', 'a1', 'user', 3),
    msg('a2', 'u2', 'assistant', 4),
    msg('a1b', 'u1', 'assistant', 5),
    msg('u1b', null, 'user', 6),
    msg('a3', 'u1b', 'assistant', 7),
  ];

  it('walks the active branch from root to leaf', () => {
    expect(branchPath(messages, 'a2').map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(branchPath(messages, 'a1b').map((m) => m.id)).toEqual(['u1', 'a1b']);
  });

  it('lists alternatives and finds the newest leaf below a message', () => {
    expect(siblingsOf(messages, messages[1]).map((m) => m.id)).toEqual(['a1', 'a1b']);
    expect(siblingsOf(messages, messages[0]).map((m) => m.id)).toEqual(['u1', 'u1b']);
    expect(latestLeaf(messages, 'u1')).toBe('a1b');
    expect(latestLeaf(messages, 'a1')).toBe('a2');
    expect(latestLeaf(messages, 'u1b')).toBe('a3');
  });
});

describe('fitToContext', () => {
  const system: ProviderMessage = { role: 'system', content: 'sys' };
  const turn = (i: number, size: number): ProviderMessage[] => [
    { role: 'user', content: `u${i} ` + 'x'.repeat(size) },
    { role: 'assistant', content: `a${i} ` + 'y'.repeat(size) },
  ];
  const history = [...turn(1, 360), ...turn(2, 360), ...turn(3, 360), { role: 'user' as const, content: 'final question' }];

  it('keeps everything that fits', () => {
    const fit = fitToContext(system, history, 10_000, 'rolling');
    expect(fit.messages).toHaveLength(history.length + 1);
    expect(fit.overflow).toBe(false);
  });

  it('stop policy reports overflow without changing messages', () => {
    const fit = fitToContext(system, history, 150, 'stop');
    expect(fit.overflow).toBe(true);
    expect(fit.messages).toHaveLength(history.length + 1);
  });

  it('rolling drops the oldest whole turns and keeps alternation', () => {
    const fit = fitToContext(system, history, 330, 'rolling');
    const roles = fit.messages.slice(1).map((m) => m.role);
    expect(roles[0]).toBe('user');
    for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
    expect(fit.messages[fit.messages.length - 1].content).toBe('final question');
    expect(fit.dropped).toBeGreaterThan(0);
    expect(fit.overflow).toBe(false);
  });

  it('truncate-middle keeps the opening turn', () => {
    const fit = fitToContext(system, history, 330, 'truncate-middle');
    expect(fit.messages[1].content.startsWith('u1')).toBe(true);
    expect(fit.messages[fit.messages.length - 1].content).toBe('final question');
    expect(fit.messages.some((m) => m.content.startsWith('u2'))).toBe(false);
  });

  it('truncates a single oversized message from the middle', () => {
    const text = 'start-' + 'z'.repeat(50_000) + '-end';
    const out = truncateMiddle(text, 2000);
    expect(out.length).toBeLessThan(2200);
    expect(out.startsWith('start-')).toBe(true);
    expect(out.endsWith('-end')).toBe(true);
  });
});

describe('artifacts', () => {
  it('parses info strings', () => {
    expect(parseInfoString('html artifact title="Pomodoro timer"')).toMatchObject({ language: 'html', isArtifact: true, title: 'Pomodoro timer' });
    expect(parseInfoString('python')).toMatchObject({ language: 'python', isArtifact: false });
    expect(parseInfoString("jsx artifact id=todo title='Todo list'")).toMatchObject({ language: 'jsx', id: 'todo', title: 'Todo list' });
  });

  it('extracts closed and still-streaming artifacts, honouring longer fences', () => {
    const text = [
      'Here you go:',
      '```html artifact title="Hello page"',
      '<h1>Hello</h1>',
      '```',
      '````markdown artifact title="Guide"',
      '# Guide',
      '```js',
      'console.log(1)',
      '```',
      '````',
      '```svg artifact title="Logo"',
      '<svg></svg>',
    ].join('\n');
    const artifacts = parseArtifacts(text);
    expect(artifacts.map((a) => [a.identifier, a.type, a.open])).toEqual([
      ['hello-page', 'html', false],
      ['guide', 'markdown', false],
      ['logo', 'svg', true],
    ]);
    expect(artifacts[1].content).toContain('console.log(1)');
    expect(artifacts[0].content).toBe('<h1>Hello</h1>');
  });

  it('ignores normal code blocks', () => {
    expect(parseArtifacts('```python\nprint(1)\n```')).toEqual([]);
  });

  it('derives titles when the model omits them, with a stable identifier', () => {
    const [page] = parseArtifacts('```html artifact\n<html><head><title>Focus Timer</title></head><body></body></html>\n```');
    expect(page).toMatchObject({ title: 'Focus Timer', identifier: 'html-1' });
    const [component] = parseArtifacts('```jsx artifact\nexport default function PomodoroTimer() { return null }\n```');
    expect(component.title).toBe('Pomodoro Timer');
    const [partial] = parseArtifacts('```html artifact\n<div>');
    expect(partial).toMatchObject({ title: 'Web page', identifier: 'html-1', open: true });
  });
});

describe('inline visualizations', () => {
  it('extracts closed and still-streaming html viz blocks, ignoring other fences', () => {
    const text = ['```html viz', '<h1>Chart</h1>', '```', '```html artifact title="Page"', '<div></div>', '```', '```html viz', '<div>partial'].join('\n');
    const blocks = parseVizBlocks(text);
    expect(blocks.map((b) => b.open)).toEqual([false, true]);
    expect(blocks[0].content).toBe('<h1>Chart</h1>');
    expect(blocks[1].content).toBe('<div>partial');
  });

  it('ignores plain html code blocks without the viz marker', () => {
    expect(parseVizBlocks('```html\n<div></div>\n```')).toEqual([]);
  });

  it('tolerates a trailing title attribute a model tacks onto the info string', () => {
    const [block] = parseVizBlocks('```html viz title="Pie chart"\n<canvas></canvas>\n```');
    expect(block.content).toBe('<canvas></canvas>');
  });

  it('does not match "viz" as a substring of another word', () => {
    expect(parseVizBlocks('```html vizard\n<div></div>\n```')).toEqual([]);
  });
});

describe('inline images', () => {
  it('parses [[image: query]] tags, tolerating case and spacing', () => {
    const tags = parseImageTags('See [[Image:  a red panda ]] and [[image:eiffel tower]].');
    expect(tags.map((t) => t.query)).toEqual(['a red panda', 'eiffel tower']);
  });

  it('renders only the first `max` tags and drops the rest', () => {
    const out = withImageTags('[[image: a]] [[image: b]] [[image: c]]', (q) => `<img data-q="${q}">`, { max: 2, streaming: false });
    expect(out).toBe('<img data-q="a"><img data-q="b">');
  });

  it('strips a trailing broken tag once the message is final, but not while still streaming', () => {
    const partial = 'Look at this [[image: half open';
    expect(withImageTags(partial, (q) => q, { max: 2, streaming: true })).toBe(partial);
    expect(withImageTags(partial, (q) => q, { max: 2, streaming: false })).toBe('Look at this ');
  });
});

describe('prompts', () => {
  it('builds a system prompt with preferences and project context', () => {
    const prompt = buildSystemPrompt({
      modelName: 'Qwen3.6',
      userName: 'Lazel',
      preferences: 'Be brief.',
      projectName: 'Thesis',
      projectInstructions: 'Cite sources.',
      projectKnowledge: '<document name="a.md">x</document>',
      artifacts: true,
      now: new Date('2026-09-13T12:00:00Z'),
    });
    expect(prompt).toContain('You are Qwen3.6');
    expect(prompt).toContain('September 13, 2026');
    expect(prompt).toContain('<user_preferences>\nBe brief.');
    expect(prompt).toContain('<project_instructions>\nCite sources.');
    expect(prompt).toContain('artifact title=');
  });

  it('skips artifact instructions for tiny models', () => {
    expect(parseParamsBillions('751.63M')).toBeCloseTo(0.75);
    expect(parseParamsBillions('35B-A3B')).toBe(35);
    expect(supportsArtifactInstructions({ paramsLabel: '1.8B' })).toBe(false);
    expect(supportsArtifactInstructions({ paramsLabel: '9.7B' })).toBe(true);
    expect(supportsArtifactInstructions({ sizeBytes: 500 * 1024 ** 2 })).toBe(false);
    expect(supportsArtifactInstructions({})).toBe(true);
    const prompt = buildSystemPrompt({ modelName: 'Tiny', userName: '', preferences: '', artifacts: false });
    expect(prompt).not.toContain('artifact title=');
  });

  it('only includes inline visualization / image instructions when their toggles are on', () => {
    const off = buildSystemPrompt({ modelName: 'M', userName: '', preferences: '', artifacts: false });
    expect(off).not.toContain('html viz');
    expect(off).not.toContain('[[image:');
    const on = buildSystemPrompt({ modelName: 'M', userName: '', preferences: '', artifacts: false, inlineVisualizations: true, inlineImages: true });
    expect(on).toContain('html viz');
    expect(on).toContain('[[image:');
  });

  it('cleans generated titles and builds fallbacks', () => {
    expect(cleanTitle('<think>hmm</think>"Local model setup."\nextra')).toBe('Local model setup');
    expect(cleanTitle('Title: Chess engine in Python')).toBe('Chess engine in Python');
    expect(fallbackTitle('how do i run llama.cpp with cuda on windows 11 please')).toBe('How do i run llama.cpp with cuda');
    expect(fallbackTitle('   ')).toBe('New chat');
  });
});
