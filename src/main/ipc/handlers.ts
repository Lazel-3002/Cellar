import { copyFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { z } from 'zod';
import type { AppInfo } from '@shared/ipc-contract';
import { Workspace } from '../agent/workspace';
import { registerBrowserHandlers } from '../browser/ipc';
import { registerChangesHandlers } from '../code/changes';
import { registerComputerHandlers } from '../computer/ipc';
import { registerCodeHandlers } from '../code/ipc';
import { registerPreviewHandlers } from '../code/preview';
import { registerSideChatHandlers } from '../code/side-chat';
import { snapshotChangeSet, snapshotDiscardFile, snapshotFileDiff } from '../code/changes-files';
import { deleteSnapshots } from '../code/snapshots';
import { registerTerminalHandlers, terminals } from '../code/terminal';
import { attachmentFromBytes, attachmentsFromPaths } from '../chat/attachments';
import { chat } from '../chat/orchestrator';
import { deleteConversations, listConversations, searchMessages } from '../db/chat-store';
import { getUsageStats } from '../db/usage-stats';
import { deleteProviderConfig, listProviderConfigs, saveProviderConfig, toPublicConfig } from '../db/provider-configs';
import { downloads } from '../hub/downloads';
import { quantFit, readme, repoDetail, searchModels } from '../hub/hf-api';
import { bus } from '../lib/events';
import { providers } from '../providers/registry';
import { OpenAIServerProvider } from '../providers/openai-server';
import { runtimes } from '../runtimes/llamacpp-runtimes';
import { artifactsForConversation, getArtifact, listArtifacts } from '../services/artifacts';
import { searchImage } from '../services/image-search';
import { registerVizDocument } from '../protocol/viz-protocol';
import * as models from '../services/models';
import { addProjectFiles, createProject, deleteProject, listProjects, projectDetail, removeProjectFile, updateProject } from '../services/projects';
import { settings } from '../services/settings';
import { updater } from '../services/updater';
import { embeddingIndex } from '../rag/embeddings';
import { detectHardware } from '../system/hardware';
import { paths } from '../system/paths';
import { applyTitleBarTheme } from '../window';
import { registerDesignHandlers } from '../design/ipc';
import { registerMathHandlers } from '../math/ipc';
import { registerStudyHandlers } from '../study/ipc';
import { registerM4Handlers } from './m4-handlers';
import { handle } from './register';

const modelRef = z.object({ providerId: z.string().min(1), modelId: z.string().min(1) });
const thinking = z.enum(['off', 'on', 'low', 'medium', 'high']);

const permissionMode = z.enum(['ask', 'auto-edits', 'plan']);

const codeStartSchema = z.object({
  folder: z.string().min(1).max(4096),
  mode: z.enum(['ask', 'plan', 'code']),
  autoAcceptEdits: z.boolean(),
  worktree: z.boolean(),
  baseBranch: z.string().max(255).optional(),
});

const sendSchema = z.object({
  conversationId: z.string().optional(),
  incognito: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  content: z.string().max(2_000_000),
  attachmentIds: z.array(z.string()).max(50),
  model: modelRef,
  thinking,
  task: z.object({ folder: z.string().min(1).nullable(), permissionMode }).optional(),
  code: codeStartSchema.optional(),
  design: z.object({ format: z.enum(['slides', 'document', 'social', 'poster', 'web', 'mobile', 'custom']), themeId: z.string().max(60) }).optional(),
  designSelection: z.object({ artboardId: z.string().max(60), elementIds: z.array(z.string().max(60)).max(400) }).nullable().optional(),
  math: z.object({ topic: z.string().max(400).optional(), paper: z.enum(['grid', 'dots', 'lined', 'plain']).optional(), angleMode: z.enum(['deg', 'rad']).optional() }).optional(),
  mathSelection: z.object({ blockId: z.string().max(60) }).nullable().optional(),
  studyContext: z
    .object({
      page: z.number().int().min(1).max(100_000),
      scope: z.enum(['page', 'pages', 'upto', 'book']),
      pages: z.string().max(400).optional(),
      from: z.number().int().min(1).max(100_000).optional(),
      selection: z.object({ page: z.number().int().min(1).max(100_000), text: z.string().max(8000) }).optional(),
    })
    .optional(),
});

const approvalSchema = z.object({ action: z.enum(['allow', 'allow-all', 'deny']), feedback: z.string().max(4000).optional() });

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

/** Files that would run rather than open; the Files panel only reveals these. */
const RUNNABLE = /\.(exe|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|wsf|wsh|hta|msi|msp|scr|pif|cpl|lnk|url|reg|jar|appref-ms|application|sh)$/i;

/** A file the task produced, resolved safely inside the task's folder. */
async function taskFile(conversationId: string, path: string): Promise<string> {
  const workspace = await Workspace.open(chat.taskWorkDir(conversationId));
  const abs = await workspace.resolve(path);
  const info = await stat(abs).catch(() => null);
  if (!info) throw new Error(`${path} no longer exists.`);
  return abs;
}

export function registerIpcHandlers(): void {
  handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    isDev: !app.isPackaged,
    userDataDir: paths().userData,
    modelsDir: settings.get().modelsDir,
    logsDir: paths().logs,
  }));
  handle('stats:usage', (range) => getUsageStats(range));
  handle('system:hardware', (refresh) => detectHardware(refresh));
  handle('system:openExternal', async (url) => {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('Only web links can be opened.');
    await shell.openExternal(parsed.toString());
  });
  handle('system:showInFolder', (path) => shell.showItemInFolder(path));
  handle('system:pickDirectory', async (title) => {
    const win = focusedWindow();
    const options = { title: title ?? 'Choose a folder', properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  handle('system:pickFiles', async (kind) => {
    const win = focusedWindow();
    const filters =
      kind === 'knowledge'
        ? [{ name: 'Documents', extensions: ['txt', 'md', 'pdf', 'json', 'csv', 'html', 'xml', 'yaml', 'yml', 'py', 'js', 'ts', 'tsx', 'java', 'go', 'rs', 'c', 'cpp', 'cs'] }]
        : kind === 'fonts'
          ? [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
          : kind === 'pdf'
            ? [{ name: 'PDF', extensions: ['pdf'] }]
          : [
              { name: 'Images, PDFs and text', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'json', 'csv', 'html', 'py', 'js', 'ts', 'tsx', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'yaml', 'yml', 'xml'] },
              { name: 'All files', extensions: ['*'] },
            ];
    const options = { properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, filters };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });
  handle('window:setTheme', (theme) => {
    for (const win of BrowserWindow.getAllWindows()) applyTitleBarTheme(win, theme);
  });
  handle('window:action', (action) => {
    const win = focusedWindow();
    if (!win) return;
    const wc = win.webContents;
    switch (action) {
      case 'reload':
        wc.reload();
        break;
      case 'devtools':
        wc.toggleDevTools();
        break;
      case 'zoom-in':
        wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4));
        break;
      case 'zoom-out':
        wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
        break;
      case 'zoom-reset':
        wc.setZoomLevel(0);
        break;
      case 'minimize':
        win.minimize();
        break;
      case 'toggle-maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;
      case 'quit':
        app.quit();
        break;
    }
  });

  handle('settings:get', () => settings.get());
  handle('settings:update', (patch) => {
    const before = settings.get();
    const next = settings.update(patch);
    if (
      before.modelsDir !== next.modelsDir ||
      before.scanHfCache !== next.scanHfCache ||
      before.scanLmStudio !== next.scanLmStudio ||
      JSON.stringify(before.extraModelDirs) !== JSON.stringify(next.extraModelDirs)
    ) {
      void models.rescanModels();
    }
    if (JSON.stringify(before.embeddingModel) !== JSON.stringify(next.embeddingModel) && next.embeddingModel) {
      for (const project of listProjects()) if (project.fileCount > 0) void embeddingIndex.index(project.id);
    }
    return next;
  });

  handle('update:state', () => updater.state());
  handle('update:check', () => updater.checkNow());
  handle('update:install', () => updater.install());

  handle('runtimes:list', (refresh) => runtimes.list(refresh));
  handle('runtimes:latestRelease', () => runtimes.latestRelease());
  handle('runtimes:install', async (variant) => {
    const info = await runtimes.install(variant);
    void providers.statusAll(true);
    return info;
  });
  handle('runtimes:addCustom', (dir) => runtimes.addCustom(dir));
  handle('runtimes:remove', async (id) => {
    await runtimes.remove(id);
    void providers.statusAll(true);
  });
  handle('runtimes:setActive', async (id) => {
    const next = await runtimes.setActive(id);
    void providers.statusAll(true);
    return next;
  });

  handle('providers:status', (refresh) => providers.statusAll(refresh));
  handle('providers:configs', () => listProviderConfigs().map(toPublicConfig));
  handle('providers:save', async (input) => {
    const saved = saveProviderConfig(input);
    providers.rebuild();
    void providers.statusAll(true);
    return toPublicConfig(saved);
  });
  handle('providers:delete', (id) => {
    deleteProviderConfig(id);
    providers.rebuild();
    void providers.statusAll(true);
  });
  handle('providers:startUnsloth', () => {
    const provider = providers.get('unsloth');
    if (!(provider instanceof OpenAIServerProvider)) throw new Error('Unsloth Studio connection is missing.');
    provider.startUnslothStudio();
    setTimeout(() => void providers.statusAll(true), 8000);
  });

  handle('models:list', (refresh) => models.listModels(refresh));
  handle('models:rescan', () => models.rescanModels());
  handle('models:detail', (ref) => models.modelDetail(modelRef.parse(ref)));
  handle('models:estimate', (ref, config) => models.estimateLoad(modelRef.parse(ref), config));
  handle('models:load', (ref, config) => models.loadModel(modelRef.parse(ref), config));
  handle('models:unload', (ref) => models.unloadModel(modelRef.parse(ref)));
  handle('models:loaded', () => models.loadedModels());
  handle('models:savePreset', (ref, preset) => models.saveModelPreset(modelRef.parse(ref), preset));
  handle('models:resetPreset', (ref) => models.resetModelPreset(modelRef.parse(ref)));
  handle('models:delete', (ref) => models.deleteModel(modelRef.parse(ref)));
  handle('models:logs', (ref) => models.modelLogs(modelRef.parse(ref)));

  handle('hub:search', (query) => searchModels(query));
  handle('hub:repo', (repoId) => repoDetail(z.string().regex(/^[\w.-]+\/[\w.-]+$/).parse(repoId)));
  handle('hub:readme', (repoId) => readme(z.string().regex(/^[\w.-]+\/[\w.-]+$/).parse(repoId)));
  handle('hub:quantFit', (repoId, label) => quantFit(repoId, label));

  handle('downloads:list', () => downloads.list());
  handle('downloads:start', (input) =>
    downloads.start(
      z
        .object({ repoId: z.string().regex(/^[\w.-]+\/[\w.-]+$/), quantLabel: z.string().min(1), target: z.enum(['cellar', 'ollama', 'lmstudio']), includeMmproj: z.boolean() })
        .parse(input),
    ),
  );
  handle('downloads:pause', (id) => downloads.pause(id));
  handle('downloads:resume', (id) => downloads.resume(id));
  handle('downloads:cancel', (id) => downloads.cancel(id));
  handle('downloads:clear', () => downloads.clear());

  handle('chat:list', (filter) => listConversations(filter));
  handle('chat:get', (id) => chat.getConversation(id));
  handle('chat:send', (input) => chat.send(sendSchema.parse(input)));
  handle('chat:regenerate', (conversationId, messageId, model, level) =>
    chat.regenerate(conversationId, messageId, model ? modelRef.parse(model) : undefined, level ? thinking.parse(level) : undefined),
  );
  handle('chat:edit', (conversationId, messageId, content, model, level) => chat.edit(conversationId, messageId, content, modelRef.parse(model), thinking.parse(level)));
  handle('chat:stop', (messageId) => chat.stop(messageId));
  handle('chat:switchBranch', (conversationId, messageId) => chat.switchBranch(conversationId, messageId));
  handle('chat:rename', (id, title) => chat.rename(id, title));
  handle('chat:star', (id, starred) => chat.setStarred(id, starred));
  handle('chat:delete', (ids) => {
    for (const id of ids) {
      chat.stopConversation(id);
      chat.discardIncognito(id);
      terminals.killForConversation(id);
      void deleteSnapshots(id).catch(() => undefined);
    }
    deleteConversations(ids);
    bus.emit('chat:changed', {});
  });
  handle('chat:moveToProject', (id, projectId) => chat.moveToProject(id, projectId));
  handle('chat:updateSettings', (id, next) => chat.updateSettings(id, next));
  handle('chat:search', (query, limit) => searchMessages(query, limit));
  handle('chat:discardIncognito', (id) => chat.discardIncognito(id));
  handle('chat:activeStreams', () => chat.activeStreams());
  /** /context command: returns the context window breakdown for a conversation. */
  handle('chat:contextInfo', (conversationId) => chat.contextInfo(conversationId ? z.string().min(1).parse(conversationId) : undefined));

  handle('tasks:approve', (messageId, toolCallId, decision) => chat.approve(messageId, toolCallId, approvalSchema.parse(decision)));
  handle('tasks:setPermissionMode', (conversationId, mode) => chat.setTaskPermissionMode(conversationId, permissionMode.parse(mode)));
  handle('tasks:toolResult', (messageId, toolCallId) => chat.toolResult(messageId, toolCallId));
  handle('tasks:openFile', async (conversationId, path) => {
    const file = await taskFile(conversationId, path);
    if (RUNNABLE.test(file)) {
      shell.showItemInFolder(file);
      return;
    }
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  });
  handle('tasks:revealFile', async (conversationId, path) => shell.showItemInFolder(await taskFile(conversationId, path)));
  // Cowork tasks never use git, so "changes" always means files saved in a pre-edit snapshot.
  handle('tasks:changes', async (conversationId) => snapshotChangeSet(conversationId, chat.taskWorkDir(conversationId)));
  handle('tasks:fileDiff', async (conversationId, path) => {
    const workspace = await Workspace.open(chat.taskWorkDir(conversationId));
    const rel = workspace.relative(await workspace.resolve(path));
    return snapshotFileDiff(conversationId, workspace.root, rel);
  });
  handle('tasks:revertFile', async (conversationId, path) => {
    const workspace = await Workspace.open(chat.taskWorkDir(conversationId));
    const rel = workspace.relative(await workspace.resolve(path));
    await snapshotDiscardFile(conversationId, workspace.root, rel);
    bus.emit('chat:changed', { conversationId });
  });
  handle('tasks:saveFileAs', async (conversationId, path) => {
    const source = await taskFile(conversationId, path);
    const win = focusedWindow();
    const options = { defaultPath: basename(source) };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await copyFile(source, result.filePath);
    return result.filePath;
  });

  handle('attachments:fromPaths', (filePaths) => attachmentsFromPaths(z.array(z.string()).max(50).parse(filePaths)));
  handle('attachments:fromBytes', (name, mime, bytes) => attachmentFromBytes(name, mime, bytes));

  handle('projects:list', () => listProjects());
  handle('projects:get', (id) => projectDetail(id));
  handle('projects:create', (input) => createProject(input));
  handle('projects:update', (id, patch) => updateProject(id, patch));
  handle('projects:delete', (id) => deleteProject(id));
  handle('projects:addFiles', (id, filePaths) => addProjectFiles(id, filePaths));
  handle('projects:removeFile', (fileId) => removeProjectFile(fileId));

  handle('artifacts:list', () => listArtifacts());
  handle('artifacts:get', (id) => getArtifact(id));
  handle('artifacts:forConversation', (conversationId) => artifactsForConversation(conversationId));
  handle('artifacts:saveAs', async (id) => {
    const artifact = getArtifact(id);
    const ext = { html: 'html', svg: 'svg', react: 'jsx', mermaid: 'mmd', markdown: 'md', code: artifact.language || 'txt' }[artifact.type];
    const win = focusedWindow();
    const options = { defaultPath: `${artifact.identifier}.${ext}` };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, artifact.content, 'utf8');
    return result.filePath;
  });

  handle('images:search', (query) => searchImage(query));
  handle('viz:register', (html) => registerVizDocument(html));
  handle('viz:saveAs', async (fileName, base64) => {
    const safe = basename(String(fileName || 'visualization.png')).replace(/[^\w.-]+/g, '-');
    const win = focusedWindow();
    const options = { defaultPath: safe };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, Buffer.from(String(base64), 'base64'));
    return result.filePath;
  });

  registerBrowserHandlers();
  registerComputerHandlers();
  registerCodeHandlers();
  registerChangesHandlers();
  registerTerminalHandlers();
  registerPreviewHandlers();
  registerSideChatHandlers();
  registerM4Handlers();
  registerDesignHandlers();
  registerMathHandlers();
  registerStudyHandlers();
}
