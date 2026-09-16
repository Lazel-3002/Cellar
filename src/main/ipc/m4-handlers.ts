/** IPC for Customize (skills, plugins, commands, connectors, memory), Scheduled, Voice and quick entry. */
import { existsSync } from 'node:fs';
import { BrowserWindow, dialog, shell } from 'electron';
import { z } from 'zod';
import { hideQuickEntry, openConversation, quickEntryShortcutActive } from '../app/background';
import { connectors } from '../connectors/manager';
import { deleteCommand, expandCommand, getCommand, listCommands, saveCommand } from '../customize/commands';
import { addMemory, clearMemories, deleteMemory, listMemories, updateMemory } from '../customize/memory';
import { installPlugin, listPlugins, removePlugin, setPluginEnabled } from '../customize/plugins';
import { claudeSkillsAvailable, deleteSkill, getSkill, importClaudeSkills, importSkills, listSkills, saveSkill, setSkillEnabled } from '../customize/skills';
import { listTools } from '../customize/tool-listing';
import { embeddingIndex } from '../rag/embeddings';
import { previewCron } from '../scheduled/cron';
import { scheduler } from '../scheduled/scheduler';
import { paths } from '../system/paths';
import { voice } from '../voice/whisper';
import { handle } from './register';

const scope = z.enum(['chat', 'task', 'code', 'design', 'math']);
const modelRef = z.object({ providerId: z.string().min(1), modelId: z.string().min(1) });
const policy = z.enum(['allow', 'ask', 'off']);
const stringRecord = z.record(z.string(), z.string());

const connectorSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(80),
  transport: z.enum(['stdio', 'http', 'sse']),
  command: z.string().max(4096),
  args: z.array(z.string().max(4096)).max(100),
  env: stringRecord,
  url: z.string().max(4096),
  headers: stringRecord,
  enabled: z.boolean(),
});

const scheduledSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(120),
  prompt: z.string().max(50_000),
  kind: z.enum(['chat', 'task']),
  cron: z.string().max(200),
  model: modelRef.nullable(),
  folder: z.string().max(4096).nullable(),
  permissionMode: z.enum(['ask', 'auto-edits', 'plan']),
  allowCommands: z.boolean(),
  projectId: z.string().nullable(),
  enabled: z.boolean(),
});

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

export function registerM4Handlers(): void {
  handle('app:background', async () => ({ quickEntryActive: quickEntryShortcutActive(), claudeDesktopConfig: existsSync(paths().claudeDesktopConfig), claudeSkills: await claudeSkillsAvailable() }));
  handle('app:openConversation', (conversationId, kind) => openConversation(z.string().min(1).parse(conversationId), z.enum(['chat', 'task', 'code', 'design', 'math']).parse(kind)));
  handle('app:hideQuickEntry', () => hideQuickEntry());
  handle('system:pickPath', async (kind) => {
    const win = focusedWindow();
    const options = {
      title: kind === 'skill' ? 'Choose a skill folder or a .zip / .skill file' : 'Choose a plugin folder or a .zip file',
      properties: ['openFile', 'openDirectory'] as Array<'openFile' | 'openDirectory'>,
      filters: [{ name: kind === 'skill' ? 'Skill archives' : 'Plugin archives', extensions: kind === 'skill' ? ['zip', 'skill'] : ['zip'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  handle('skills:list', () => listSkills());
  handle('skills:get', (id) => getSkill(id));
  handle('skills:save', (input) => saveSkill(z.object({ id: z.string().optional(), name: z.string().max(64), description: z.string().max(1024), body: z.string().max(200_000) }).parse(input)));
  handle('skills:setEnabled', (id, enabled) => setSkillEnabled(z.string().min(1).parse(id), !!enabled));
  handle('skills:delete', (id) => deleteSkill(id));
  handle('skills:import', (path) => importSkills(z.string().min(1).parse(path)));
  handle('skills:importClaude', () => importClaudeSkills());
  handle('skills:reveal', async (id) => {
    const dir = id ? (await getSkill(id)).dir : paths().skills;
    await shell.openPath(dir);
  });

  handle('plugins:list', () => listPlugins());
  handle('plugins:install', (source) => installPlugin(z.string().min(1).max(4096).parse(source)));
  handle('plugins:setEnabled', (id, enabled) => setPluginEnabled(z.string().min(1).parse(id), !!enabled));
  handle('plugins:remove', (id) => removePlugin(id));
  handle('plugins:reveal', async (id) => {
    const plugin = (await listPlugins()).find((p) => p.id === id);
    if (plugin) await shell.openPath(plugin.dir);
  });

  handle('commands:list', (s) => listCommands(scope.parse(s)));
  handle('commands:get', (name) => getCommand(name));
  handle('commands:expand', (name, args) => expandCommand(z.string().min(1).parse(name), z.string().max(200_000).parse(args)));
  handle('commands:save', (input) => saveCommand(z.object({ previousName: z.string().optional(), name: z.string().max(64), description: z.string().max(300), body: z.string().max(200_000) }).parse(input)));
  handle('commands:delete', (name) => deleteCommand(name));

  handle('connectors:list', () => connectors.list());
  handle('connectors:save', (input) => connectors.save(connectorSchema.parse(input)));
  handle('connectors:delete', (id) => connectors.remove(id));
  handle('connectors:setEnabled', (id, enabled) => connectors.setEnabled(id, !!enabled));
  handle('connectors:reconnect', (id) => connectors.reconnect(id));
  handle('connectors:setToolPolicy', (id, tool, value) => connectors.setToolPolicy(id, z.string().min(1).parse(tool), value === null ? null : policy.parse(value)));
  handle('connectors:importJson', (json) => connectors.importJson(z.string().max(1_000_000).parse(json)));
  handle('connectors:importClaude', () => connectors.importClaudeDesktop());

  handle('memory:list', () => listMemories());
  handle('memory:add', (content) => addMemory(z.string().max(5000).parse(content), 'user'));
  handle('memory:update', (id, content) => updateMemory(id, z.string().max(5000).parse(content)));
  handle('memory:delete', (id) => deleteMemory(id));
  handle('memory:clear', () => clearMemories());

  handle('tools:list', (s, conversationId, model) => listTools(scope.parse(s), conversationId, model ? modelRef.parse(model) : undefined));

  handle('scheduled:list', () => scheduler.list());
  handle('scheduled:save', (input) => scheduler.save(scheduledSchema.parse(input)));
  handle('scheduled:setEnabled', (id, enabled) => scheduler.setEnabled(id, !!enabled));
  handle('scheduled:delete', (id) => scheduler.delete(id));
  handle('scheduled:runNow', (id) => scheduler.runNow(id));
  handle('scheduled:runs', (taskId) => scheduler.runs(taskId));
  handle('scheduled:preview', (cron) => previewCron(z.string().max(200).parse(cron)));

  handle('voice:status', () => voice.status());
  handle('voice:installRuntime', async (variant) => {
    await voice.installRuntime(z.enum(['cpu', 'blas', 'cuda-12']).parse(variant));
  });
  handle('voice:downloadModel', (id) => voice.downloadModel(id));
  handle('voice:deleteModel', (id) => voice.deleteModel(id));
  handle('voice:transcribe', (wav, language) => {
    if (!(wav instanceof Uint8Array) || wav.byteLength > 200 * 1024 * 1024) throw new Error('The recording could not be read.');
    return voice.transcribe(wav, language ? z.string().regex(/^(auto|[a-z]{2,3})$/).parse(language) : undefined);
  });

  handle('projects:indexStatus', (projectId) => embeddingIndex.status(projectId));
  handle('projects:reindex', async (projectId) => {
    void embeddingIndex.reindex(projectId);
  });
}
