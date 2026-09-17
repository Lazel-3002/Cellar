import { userInfo } from 'node:os';
import type { AppSettings, AppSettingsPatch } from '@shared/types/settings';
import { all, run, transaction } from '../db/client';
import { bus } from '../lib/events';
import { openSecret, sealSecret } from '../lib/secrets';
import { paths } from '../system/paths';

type StoredSettings = Omit<AppSettings, 'hasHfToken'> & { hfToken: string };

function defaults(): StoredSettings {
  let name = 'there';
  try {
    name = userInfo().username || name;
  } catch {
    // ignore
  }
  return {
    userName: name,
    personalPreferences: '',
    theme: 'dark',
    accent: '#D97757',
    chatFont: 'default',
    sendWithEnter: true,
    showGenerationStats: true,
    autoTitle: true,
    artifacts: true,
    inlineVisualizations: false,
    inlineImages: false,
    defaultModel: null,
    defaultContextLength: 16384,
    jitLoad: true,
    idleUnloadMinutes: 30,
    maxLoadedModels: 1,
    modelsDir: paths().defaultModelsDir,
    extraModelDirs: [],
    scanHfCache: true,
    scanLmStudio: true,
    hfToken: '',
    activeRuntimeId: null,
    concurrentDownloads: 1,
    onboardingDone: false,
    coworkPermissionMode: 'ask',
    coworkMaxSteps: 40,
    coworkWebAccess: true,
    coworkNotifications: true,
    webSearchProvider: 'duckduckgo',
    searxngUrl: '',
    recentFolders: [],
    codeMode: 'code',
    codeAutoAcceptEdits: false,
    codeUseWorktrees: true,
    codeMaxSteps: 80,
    terminalShell: 'auto',
    recentRepos: [],
    chatWebSearch: true,
    disabledSkills: [],
    disabledPlugins: [],
    memoryEnabled: true,
    searchPastChats: true,
    runInBackground: true,
    // Ctrl+Alt+Space belongs to Claude Desktop's quick entry, which people often run alongside.
    quickEntryShortcut: 'Alt+Shift+Space',
    voiceModel: 'ggml-base.bin',
    voiceLanguage: 'auto',
    embeddingModel: null,
    autoUpdateCheck: true,
    voiceReplies: false,
    voiceReplyVoice: '',
    ttsEngine: 'system',
    piperVoice: 'en_US-amy-medium',
    voiceStreaming: true,
    // Off by default: ten more tool schemas are a real slice of a 16K context window, and browsing
    // on the user's own logged-in session is something to opt into rather than inherit.
    browserEnabled: false,
    browserApprovalMode: 'manual',
    browserMaxSteps: 25,
    moduleCalls: true,
    moduleCallsPerMinute: 5,
    selfScheduling: true,
  };
}

const uniqueStrings = (values: string[], max = 500) => [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].slice(0, max);

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

class SettingsService {
  private state: StoredSettings | null = null;

  private load(): StoredSettings {
    const base = defaults();
    const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const record = base as unknown as Record<string, unknown>;
    for (const row of rows) {
      if (!(row.key in base)) continue;
      try {
        record[row.key] = JSON.parse(row.value);
      } catch {
        // keep default
      }
    }
    base.hfToken = openSecret(base.hfToken);
    return base;
  }

  private stored(): StoredSettings {
    if (!this.state) this.state = this.load();
    return this.state;
  }

  get(): AppSettings {
    const { hfToken, ...rest } = this.stored();
    return { ...rest, hasHfToken: hfToken.length > 0 };
  }

  hfToken(): string {
    return this.stored().hfToken;
  }

  update(patch: AppSettingsPatch): AppSettings {
    const next: StoredSettings = { ...this.stored() };
    const changes: Array<[string, unknown]> = [];
    const set = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => {
      next[key] = value;
      changes.push([key, key === 'hfToken' ? sealSecret(value as string) : value]);
    };

    if (patch.userName !== undefined) set('userName', patch.userName.trim().slice(0, 60));
    if (patch.personalPreferences !== undefined) set('personalPreferences', patch.personalPreferences.slice(0, 20_000));
    if (patch.theme !== undefined && ['dark', 'light', 'system'].includes(patch.theme)) set('theme', patch.theme);
    if (patch.accent !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.accent)) set('accent', patch.accent);
    if (patch.chatFont !== undefined && ['default', 'sans', 'system'].includes(patch.chatFont)) set('chatFont', patch.chatFont);
    if (patch.sendWithEnter !== undefined) set('sendWithEnter', !!patch.sendWithEnter);
    if (patch.showGenerationStats !== undefined) set('showGenerationStats', !!patch.showGenerationStats);
    if (patch.autoTitle !== undefined) set('autoTitle', !!patch.autoTitle);
    if (patch.artifacts !== undefined) set('artifacts', !!patch.artifacts);
    if (patch.inlineVisualizations !== undefined) set('inlineVisualizations', !!patch.inlineVisualizations);
    if (patch.inlineImages !== undefined) set('inlineImages', !!patch.inlineImages);
    if (patch.defaultModel !== undefined) set('defaultModel', patch.defaultModel);
    if (patch.defaultContextLength !== undefined) set('defaultContextLength', clamp(patch.defaultContextLength, 512, 2_000_000));
    if (patch.jitLoad !== undefined) set('jitLoad', !!patch.jitLoad);
    if (patch.idleUnloadMinutes !== undefined) set('idleUnloadMinutes', clamp(patch.idleUnloadMinutes, 0, 24 * 60));
    if (patch.maxLoadedModels !== undefined) set('maxLoadedModels', clamp(patch.maxLoadedModels, 1, 8));
    if (patch.modelsDir !== undefined && patch.modelsDir.trim()) set('modelsDir', patch.modelsDir.trim());
    if (patch.extraModelDirs !== undefined) set('extraModelDirs', [...new Set(patch.extraModelDirs.map((d) => d.trim()).filter(Boolean))]);
    if (patch.scanHfCache !== undefined) set('scanHfCache', !!patch.scanHfCache);
    if (patch.scanLmStudio !== undefined) set('scanLmStudio', !!patch.scanLmStudio);
    if (patch.hfToken !== undefined) set('hfToken', patch.hfToken.trim());
    if (patch.activeRuntimeId !== undefined) set('activeRuntimeId', patch.activeRuntimeId);
    if (patch.concurrentDownloads !== undefined) set('concurrentDownloads', clamp(patch.concurrentDownloads, 1, 4));
    if (patch.onboardingDone !== undefined) set('onboardingDone', !!patch.onboardingDone);
    if (patch.coworkPermissionMode !== undefined && ['ask', 'auto-edits', 'plan'].includes(patch.coworkPermissionMode)) set('coworkPermissionMode', patch.coworkPermissionMode);
    if (patch.coworkMaxSteps !== undefined) set('coworkMaxSteps', clamp(patch.coworkMaxSteps, 5, 500));
    if (patch.coworkWebAccess !== undefined) set('coworkWebAccess', !!patch.coworkWebAccess);
    if (patch.coworkNotifications !== undefined) set('coworkNotifications', !!patch.coworkNotifications);
    if (patch.webSearchProvider !== undefined && ['duckduckgo', 'brave', 'searxng'].includes(patch.webSearchProvider)) set('webSearchProvider', patch.webSearchProvider);
    if (patch.searxngUrl !== undefined) set('searxngUrl', patch.searxngUrl.trim().replace(/\/+$/, ''));
    if (patch.recentFolders !== undefined) set('recentFolders', [...new Set(patch.recentFolders.map((d) => d.trim()).filter(Boolean))].slice(0, 8));
    if (patch.codeMode !== undefined && ['ask', 'plan', 'code'].includes(patch.codeMode)) set('codeMode', patch.codeMode);
    if (patch.codeAutoAcceptEdits !== undefined) set('codeAutoAcceptEdits', !!patch.codeAutoAcceptEdits);
    if (patch.codeUseWorktrees !== undefined) set('codeUseWorktrees', !!patch.codeUseWorktrees);
    if (patch.codeMaxSteps !== undefined) set('codeMaxSteps', clamp(patch.codeMaxSteps, 5, 500));
    if (patch.terminalShell !== undefined && ['auto', 'pwsh', 'powershell', 'cmd'].includes(patch.terminalShell)) set('terminalShell', patch.terminalShell);
    if (patch.recentRepos !== undefined) set('recentRepos', [...new Set(patch.recentRepos.map((d) => d.trim()).filter(Boolean))].slice(0, 10));
    if (patch.chatWebSearch !== undefined) set('chatWebSearch', !!patch.chatWebSearch);
    if (patch.disabledSkills !== undefined) set('disabledSkills', uniqueStrings(patch.disabledSkills));
    if (patch.disabledPlugins !== undefined) set('disabledPlugins', uniqueStrings(patch.disabledPlugins));
    if (patch.memoryEnabled !== undefined) set('memoryEnabled', !!patch.memoryEnabled);
    if (patch.searchPastChats !== undefined) set('searchPastChats', !!patch.searchPastChats);
    if (patch.runInBackground !== undefined) set('runInBackground', !!patch.runInBackground);
    if (patch.quickEntryShortcut !== undefined) set('quickEntryShortcut', patch.quickEntryShortcut.trim().slice(0, 60));
    if (patch.voiceModel !== undefined && /^ggml-[\w.-]+\.bin$/.test(patch.voiceModel)) set('voiceModel', patch.voiceModel);
    if (patch.voiceLanguage !== undefined && /^(auto|[a-z]{2,3})$/.test(patch.voiceLanguage)) set('voiceLanguage', patch.voiceLanguage);
    if (patch.embeddingModel !== undefined) set('embeddingModel', patch.embeddingModel && patch.embeddingModel.providerId && patch.embeddingModel.modelId ? { providerId: patch.embeddingModel.providerId, modelId: patch.embeddingModel.modelId } : null);
    if (patch.autoUpdateCheck !== undefined) set('autoUpdateCheck', !!patch.autoUpdateCheck);
    if (patch.voiceReplies !== undefined) set('voiceReplies', !!patch.voiceReplies);
    if (patch.voiceReplyVoice !== undefined) set('voiceReplyVoice', patch.voiceReplyVoice.trim().slice(0, 200));
    if (patch.ttsEngine !== undefined && ['system', 'piper'].includes(patch.ttsEngine)) set('ttsEngine', patch.ttsEngine);
    if (patch.piperVoice !== undefined && /^[\w-]{1,60}$/.test(patch.piperVoice)) set('piperVoice', patch.piperVoice);
    if (patch.voiceStreaming !== undefined) set('voiceStreaming', !!patch.voiceStreaming);
    if (patch.browserEnabled !== undefined) set('browserEnabled', !!patch.browserEnabled);
    if (patch.browserApprovalMode !== undefined && ['manual', 'auto', 'bypass'].includes(patch.browserApprovalMode)) set('browserApprovalMode', patch.browserApprovalMode);
    if (patch.browserMaxSteps !== undefined) set('browserMaxSteps', clamp(patch.browserMaxSteps, 5, 200));
    if (patch.moduleCalls !== undefined) set('moduleCalls', !!patch.moduleCalls);
    if (patch.moduleCallsPerMinute !== undefined) set('moduleCallsPerMinute', clamp(patch.moduleCallsPerMinute, 1, 60));
    if (patch.selfScheduling !== undefined) set('selfScheduling', !!patch.selfScheduling);

    if (changes.length) {
      transaction(() => {
        for (const [key, value] of changes) {
          run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
        }
      });
      this.state = next;
      bus.emit('settings:changed', this.get());
    }
    return this.get();
  }
}

export const settings = new SettingsService();
