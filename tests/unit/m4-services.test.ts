import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamEvent } from '../../src/shared/types/chat';
import type { ModelEntry } from '../../src/shared/types/models';
import type { ProviderStatus } from '../../src/shared/types/providers';

process.env.CELLAR_HOME = join(tmpdir(), `cellar-m4-home-${process.pid}`);
// The scheduler now syncs an OS-level wake job (Task Scheduler/launchd/cron) on every change; opt out
// so the suite never creates or deletes a real scheduled task on the machine running it.
process.env.CELLAR_NO_OS_SCHEDULE = '1';

const { initPaths, paths } = await import('../../src/main/system/paths');
const { closeDatabase, openDatabase, run } = await import('../../src/main/db/client');
const { settings } = await import('../../src/main/services/settings');
const { providers } = await import('../../src/main/providers/registry');
const { chat } = await import('../../src/main/chat/orchestrator');
const diagnostics = await import('../../src/main/code/diagnostics');
const { describeCron, nextFire, previewCron } = await import('../../src/main/scheduled/cron');
const { scheduler } = await import('../../src/main/scheduled/scheduler');
const rag = await import('../../src/main/rag/embeddings');
const { addProjectFiles, createProject, projectKnowledge } = await import('../../src/main/services/projects');
const { cleanTranscript } = await import('../../src/main/voice/whisper');
const { parseBraveHtml } = await import('../../src/main/agent/html');
const { Workspace } = await import('../../src/main/agent/workspace');
const { writeFileTool } = await import('../../src/main/agent/tools/files');
type ChatRequest = import('../../src/main/providers/types').ChatRequest;
type Provider = import('../../src/main/providers/types').Provider;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Set-of-words vectors: texts that share words point the same way. */
function embedText(text: string): number[] {
  const vector = new Array<number>(4096).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 2166136261;
    for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    vector[h % 4096] = 1;
  }
  return vector;
}

class FakeProvider implements Provider {
  readonly id = 'fake';
  readonly kind = 'openai' as const;
  readonly name = 'Fake';
  readonly canManageModels = false;
  readonly canDownload = false;
  requests: ChatRequest[] = [];
  embedCalls = 0;
  async status(): Promise<ProviderStatus> {
    return { id: this.id, kind: this.kind, name: this.name, baseUrl: '', state: 'online', canManageModels: false, canDownload: false };
  }
  async listModels(): Promise<ModelEntry[]> {
    return [];
  }
  async *chat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    this.requests.push(req);
    await sleep(2);
    yield { type: 'text', delta: 'Scheduled hello.' };
    yield { type: 'done', stopReason: 'stop' };
  }
  async embed(_entry: ModelEntry, input: string[]): Promise<number[][]> {
    this.embedCalls++;
    return input.map(embedText);
  }
}

const fake = new FakeProvider();
const model = (id: string, embedding: boolean): ModelEntry => ({
  ref: { providerId: 'fake', modelId: id },
  providerKind: 'openai',
  providerName: 'Fake',
  displayName: id,
  contextLength: 32768,
  capabilities: { vision: false, tools: false, reasoning: false, embedding },
  reasoningStyle: 'none',
  loaded: true,
});
let userData: string;
let work: string;

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cellar-m4-data-'));
  work = await mkdtemp(join(tmpdir(), 'cellar-m4-work-'));
  initPaths(userData, userData);
  closeDatabase();
  openDatabase(':memory:');
  settings.update({ autoTitle: false, coworkNotifications: false, memoryEnabled: false });
  (providers as unknown as { get: (id: string) => Provider }).get = () => fake;
  (providers as unknown as { findModel: (ref: { modelId: string }) => Promise<ModelEntry> }).findModel = async (ref) => model(ref.modelId, ref.modelId.includes('embed'));
});

afterAll(async () => {
  scheduler.dispose();
  chat.stopAll();
  await rm(userData, { recursive: true, force: true }).catch(() => undefined);
  await rm(work, { recursive: true, force: true }).catch(() => undefined);
  await rm(process.env.CELLAR_HOME!, { recursive: true, force: true }).catch(() => undefined);
});

describe('diagnostics', () => {
  it('finds JavaScript and JSON syntax errors with their location', async () => {
    const js = join(work, 'broken.js');
    await writeFile(js, 'const ok = 1;\nconst broken = ;\nconsole.log(ok);\n');
    const [problem] = await diagnostics.quickCheck(js, work);
    expect(problem).toMatchObject({ path: 'broken.js', line: 2, severity: 'error', source: 'node', message: expect.stringContaining('SyntaxError') });

    expect(diagnostics.checkJsonText('{\n  // comment\n  "a": 1,\n}', 'tsconfig.json')).toEqual([]);
    expect(diagnostics.checkJsonText('{\n  "a": 1\n  "b": 2\n}', 'data.json')[0]).toMatchObject({ line: 3, source: 'json' });
  });

  it('reports Python syntax errors when Python is installed', async () => {
    const py = join(work, 'physics.py');
    await writeFile(py, 'import math\\n\nprint(math.pi)\n');
    const problems = await diagnostics.quickCheck(py, work);
    if (!(await diagnostics.which('python')) && !(await diagnostics.which('py'))) return;
    expect(problems[0]).toMatchObject({ path: 'physics.py', line: 1, severity: 'error', source: 'python' });
  });

  it('adds problems to write_file results so the model sees them', async () => {
    const workspace = await Workspace.open(work);
    const ctx = {
      workspace,
      task: {} as never,
      settings: settings.get(),
      signal: new AbortController().signal,
      maxResultChars: 10_000,
      knownUrls: new Set<string>(),
      recordFile: () => undefined,
      recordSource: () => undefined,
      setTodos: () => undefined,
      afterChange: (abs: string) => diagnostics.problemsAfterChange(abs, work),
    };
    const bad = await writeFileTool.run({ path: 'app.mjs', content: 'export const x = ;\n' }, ctx);
    expect(bad).toContain('Problems in app.mjs after this change');
    expect(bad).toMatch(/app\.mjs:1:\d+ error: SyntaxError/);
    expect(await writeFileTool.run({ path: 'app.mjs', content: 'export const x = 1;\n' }, ctx)).toBe('Replaced app.mjs (2 lines, 20 B).');
  });

  it('parses tsc, cargo and go vet output', () => {
    expect(diagnostics.parseTscOutput('src/a.ts(3,7): error TS2322: Type "string" is not assignable to type "number".', work)[0]).toMatchObject({ path: 'src/a.ts', line: 3, column: 7, message: expect.stringMatching(/^TS2322: /) });
    expect(diagnostics.parseColonOutput('src/main.rs:4:5: error[E0425]: cannot find value `y` in this scope', work, 'cargo')[0]).toMatchObject({ path: 'src/main.rs', line: 4, column: 5, severity: 'error' });
    expect(diagnostics.formatProblems([])).toBe('No problems found.');
  });
});

describe('scheduled tasks', () => {
  it('describes and previews cron schedules', () => {
    expect(describeCron('0 9 * * 1-5')).toBe('Every weekday at 09:00');
    expect(describeCron('30 18 * * 5')).toBe('Every Friday at 18:30');
    expect(describeCron('15 * * * *')).toBe('Every hour at :15');
    expect(describeCron('0 8 1 * *')).toBe('On day 1 of every month at 08:00');
    const from = new Date(2026, 8, 15, 10, 0);
    expect(previewCron('0 9 * * *', 2, from).next).toEqual([new Date(2026, 8, 16, 9, 0).getTime(), new Date(2026, 8, 17, 9, 0).getTime()]);
    expect(previewCron('0 9 * *').valid).toBe(false);
    expect(nextFire('0 9 * * *', new Date(2026, 8, 15, 8, 0).getTime())).toBe(new Date(2026, 8, 15, 9, 0).getTime());
  });

  it('fires due tasks once, records the run and catches up on missed runs', async () => {
    scheduler.init();
    const task = scheduler.save({ name: 'Morning', prompt: 'Say hello', kind: 'chat', cron: '0 9 * * *', model: { providerId: 'fake', modelId: 'chatty' }, folder: null, permissionMode: 'auto-edits', allowCommands: false, projectId: null, enabled: true });
    expect(task.nextRunAt).toBeGreaterThan(Date.now());

    // save() rewrites ~/.cellar/scheduled_tasks.json in the background (CELLAR_NO_OS_SCHEDULE keeps
    // the actual OS wake job a no-op in tests); wait for that write to land.
    const registry = await (async () => {
      for (let i = 0; i < 100; i++) {
        const parsed = await readFile(paths().scheduledRegistry, 'utf8').then(JSON.parse).catch(() => null);
        if (parsed?.tasks?.some((t: { id: string }) => t.id === task.id)) return parsed;
        await sleep(20);
      }
      throw new Error('scheduled task registry was never written');
    })();
    expect(registry.tasks).toContainEqual(expect.objectContaining({ id: task.id, name: 'Morning', cron: '0 9 * * *' }));

    // Pretend the last check was two days ago: the missed 09:00 run happens once.
    run('UPDATE scheduled_tasks SET last_fire_at = ? WHERE id = ?', Date.now() - 2 * 24 * 3600_000, task.id);
    await scheduler.tick();
    await scheduler.tick();
    const finished = await (async () => {
      for (let i = 0; i < 200; i++) {
        const runs = scheduler.runs(task.id);
        if (runs[0]?.status === 'done') return runs;
        await sleep(20);
      }
      return scheduler.runs(task.id);
    })();
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ trigger: 'catch-up', status: 'done', kind: 'chat', taskName: 'Morning' });
    const conversation = chat.getConversation(finished[0].conversationId!);
    expect(conversation.conversation.title).toMatch(/^Morning · /);
    expect(conversation.messages.at(-1)?.content).toBe('Scheduled hello.');
    expect(scheduler.get(task.id).lastStatus).toBe('done');

    await expect(scheduler.runNow(task.id)).resolves.toMatchObject({ conversationId: expect.any(String) });
    expect(() => scheduler.save({ ...task, cron: 'every day' })).toThrow('five fields');
  });
});

describe('project knowledge search', () => {
  it('fuses rankings and normalizes vectors', () => {
    expect(rag.fuseRankings([['a', 'b', 'c'], ['c', 'a']])).toEqual(['a', 'c', 'b']);
    expect(rag.dot(rag.fromBlob(rag.toBlob([3, 4])), rag.fromBlob(rag.toBlob([3, 4])))).toBeCloseTo(1, 5);
    expect(rag.embeddingPrefixes('nomic-embed-text:latest').query).toBe('search_query: ');
  });

  it('indexes project files with the embedding model and finds chunks by meaning', async () => {
    const project = createProject({ name: 'Garden', description: '' });
    const filler = (topic: string) => Array.from({ length: 120 }, (_, i) => `${topic} paragraph ${i} with enough words to fill a chunk.`).join('\n\n');
    const files = [join(work, 'tomatoes.md'), join(work, 'ledger.md')];
    await writeFile(files[0], `${filler('Tomatoes need sunlight and water')}\n\nPrune tomato suckers weekly for bigger harvests.`);
    await writeFile(files[1], filler('Quarterly invoices and budgets'));
    await addProjectFiles(project.id, files);
    expect(rag.embeddingIndex.status(project.id).state).toBe('off');

    settings.update({ embeddingModel: { providerId: 'fake', modelId: 'embed-small' } });
    await rag.embeddingIndex.index(project.id);
    const status = rag.embeddingIndex.status(project.id);
    expect(status).toMatchObject({ state: 'ready' });
    expect(status.embedded).toBe(status.chunks);

    // "suckers" is not in the query, so only the semantic ranking can find the pruning chunk.
    const knowledge = await projectKnowledge(project.id, 'how should I prune tomato plants for harvests', 900);
    expect(knowledge).toContain('Prune tomato suckers weekly');
    expect(knowledge).not.toContain('invoices');
  });
});

describe('web search fallback', () => {
  it('parses Brave Search result pages', () => {
    const html = [
      '<div class="snippet svelte-x" data-pos="0" data-type="web"><a href="https://github.com/ggml-org/llama.cpp/releases" class="l1"><cite>github.com</cite>',
      '<div class="title search-snippet-title line-clamp-1" title="Releases · ggml-org/llama.cpp">Releases · ggml-org/llama.cpp</div></a>',
      '<div class="generic-snippet"><div class="content desktop-default-regular t-primary"><span class="t-secondary">1 week ago -</span>Jump to release · <strong>b10951</strong> &amp; more</div></div></div>',
      '<div class="snippet" data-type="web"><a href="https://search.brave.com/ask?q=x">Ask</a></div>',
    ].join('');
    expect(parseBraveHtml(html)).toEqual([{ title: 'Releases · ggml-org/llama.cpp', url: 'https://github.com/ggml-org/llama.cpp/releases', snippet: 'Jump to release · b10951 & more' }]);
  });
});

describe('voice', () => {
  it('cleans whisper.cpp output', () => {
    expect(cleanTranscript(' Hello there.\n[BLANK_AUDIO]\n[00:00:01.000 --> 00:00:02.000]  How are you?\n')).toBe('Hello there. How are you?');
  });
});
