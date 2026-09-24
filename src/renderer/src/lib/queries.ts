import { useEffect } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationFilter, ProjectDetail } from '@shared/types/chat';
import type { ToolScope } from '@shared/types/customize';
import type { HfSearchQuery } from '@shared/types/hub';
import type { ModelRef } from '@shared/types/models';
import type { AppSettings, AppSettingsPatch } from '@shared/types/settings';
import type { UsageRange } from '@shared/types/stats';
import { useStreams } from '../stores/streams';
import { useFollowUps } from '@/stores/followUps';
import { invoke, onEvent } from './ipc';
import { speak, speakReply } from './tts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export const keys = {
  settings: ['settings'] as const,
  appInfo: ['app-info'] as const,
  hardware: ['hardware'] as const,
  providers: ['providers'] as const,
  providerConfigs: ['provider-configs'] as const,
  models: ['models'] as const,
  loaded: ['models', 'loaded'] as const,
  modelDetail: (ref: ModelRef) => ['model-detail', ref.providerId, ref.modelId] as const,
  conversations: (filter?: ConversationFilter) => ['conversations', filter ?? {}] as const,
  conversation: (id: string) => ['conversation', id] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  artifacts: ['artifacts'] as const,
  conversationArtifacts: (id: string) => ['artifacts', 'conversation', id] as const,
  downloads: ['downloads'] as const,
  runtimes: ['runtimes'] as const,
  release: ['runtime-release'] as const,
  hubSearch: (q: HfSearchQuery) => ['hub-search', q] as const,
  hubRepo: (id: string) => ['hub-repo', id] as const,
  hubReadme: (id: string) => ['hub-readme', id] as const,
  quantFit: (repo: string, label: string) => ['quant-fit', repo, label] as const,
  skills: ['skills'] as const,
  plugins: ['plugins'] as const,
  pluginMarketplaces: (q?: { search?: string; sort?: string }) => ['plugin-marketplaces', q ?? {}] as const,
  commands: (scope: string) => ['commands', scope] as const,
  connectors: ['connectors'] as const,
  memory: ['memory'] as const,
  memoryTopics: ['memory-topics'] as const,
  scheduled: ['scheduled'] as const,
  scheduledRuns: (taskId?: string) => ['scheduled-runs', taskId ?? 'all'] as const,
  voice: ['voice'] as const,
  tts: ['tts'] as const,
  background: ['background'] as const,
  update: ['update'] as const,
  usage: (range: UsageRange) => ['usage', range] as const,
};

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => invoke('settings:get'), staleTime: Infinity });

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: AppSettingsPatch) => invoke('settings:update', patch),
    onSuccess: (next: AppSettings) => qc.setQueryData(keys.settings, next),
  });
}

export const useAppInfo = () => useQuery({ queryKey: keys.appInfo, queryFn: () => invoke('app:info'), staleTime: Infinity });
export const useUsageStats = (range: UsageRange) => useQuery({ queryKey: keys.usage(range), queryFn: () => invoke('stats:usage', range), staleTime: 60_000 });
export const useHardware = () => useQuery({ queryKey: keys.hardware, queryFn: () => invoke('system:hardware', false), staleTime: 60_000 });
export const useProviders = () => useQuery({ queryKey: keys.providers, queryFn: () => invoke('providers:status', false), staleTime: 15_000 });
export const useProviderConfigs = () => useQuery({ queryKey: keys.providerConfigs, queryFn: () => invoke('providers:configs') });
export const useModels = () => useQuery({ queryKey: keys.models, queryFn: () => invoke('models:list', false), staleTime: 10_000 });
export const useLoadedModels = () => useQuery({ queryKey: keys.loaded, queryFn: () => invoke('models:loaded'), staleTime: 5_000 });
export const useModelDetail = (ref: ModelRef | null) =>
  useQuery({ queryKey: ref ? keys.modelDetail(ref) : ['model-detail', 'none'], queryFn: () => invoke('models:detail', ref!), enabled: !!ref });
export const useConversations = (filter?: ConversationFilter) =>
  useQuery({ queryKey: keys.conversations(filter), queryFn: () => invoke('chat:list', filter) });
export const useConversation = (id: string | undefined) =>
  useQuery({ queryKey: keys.conversation(id ?? ''), queryFn: () => invoke('chat:get', id!), enabled: !!id, staleTime: 0 });
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: () => invoke('projects:list') });
export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => invoke('projects:get', id) });
export const useArtifacts = () => useQuery({ queryKey: keys.artifacts, queryFn: () => invoke('artifacts:list') });
export const useConversationArtifacts = (id: string | undefined) =>
  useQuery({ queryKey: keys.conversationArtifacts(id ?? ''), queryFn: () => invoke('artifacts:forConversation', id!), enabled: !!id });
export const useDownloads = () => useQuery({ queryKey: keys.downloads, queryFn: () => invoke('downloads:list'), staleTime: Infinity });
export const useRuntimes = () => useQuery({ queryKey: keys.runtimes, queryFn: () => invoke('runtimes:list', false), staleTime: 60_000 });
export const useSkills = () => useQuery({ queryKey: keys.skills, queryFn: () => invoke('skills:list') });
export const usePlugins = () => useQuery({ queryKey: keys.plugins, queryFn: () => invoke('plugins:list') });
export function usePluginMarketplaces(query?: { search?: string; sort?: string }) {
  return useQuery({ queryKey: keys.pluginMarketplaces(query), queryFn: () => invoke('plugins:marketplace:search', query ?? {}), staleTime: 60 * 60_000 });
}
export const useInstallPluginFromMarketplace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => invoke('plugins:marketplace:install', repoId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.plugins }),
  });
};
export const useCommands = (scope: ToolScope) => useQuery({ queryKey: keys.commands(scope), queryFn: () => invoke('commands:list', scope), staleTime: 60_000 });
export const useConnectors = () => useQuery({ queryKey: keys.connectors, queryFn: () => invoke('connectors:list') });
export const useMemories = () => useQuery({ queryKey: keys.memory, queryFn: () => invoke('memory:list') });
export const useMemoryTopics = () => useQuery({ queryKey: keys.memoryTopics, queryFn: () => invoke('memory:listTopics') });
export const useScheduled = () => useQuery({ queryKey: keys.scheduled, queryFn: () => invoke('scheduled:list'), refetchInterval: 30_000 });
export const useScheduledRuns = (taskId?: string) => useQuery({ queryKey: keys.scheduledRuns(taskId), queryFn: () => invoke('scheduled:runs', taskId) });
export const useVoice = () => useQuery({ queryKey: keys.voice, queryFn: () => invoke('voice:status'), staleTime: 60_000 });
export const useTts = () => useQuery({ queryKey: keys.tts, queryFn: () => invoke('tts:status'), staleTime: 60_000 });
export const useBackground = () => useQuery({ queryKey: keys.background, queryFn: () => invoke('app:background'), staleTime: 10_000 });
export const useUpdateState = () => useQuery({ queryKey: keys.update, queryFn: () => invoke('update:state'), staleTime: Infinity });

export function useCheckForUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke('update:check'),
    onSuccess: (next) => qc.setQueryData(keys.update, next),
  });
}

export function useInstallUpdate() {
  return useMutation({ mutationFn: () => invoke('update:install') });
}

/** Subscribes to main-process events once and keeps the query cache in sync. */
export function useIpcSync(): void {
  const qc = useQueryClient();
  const applyStream = useStreams((s) => s.apply);

  useEffect(() => {
    const offs = [
      onEvent('chat:stream', (event) => {
        applyStream(event);
        if (event.status === 'complete') {
          const current = qc.getQueryData<AppSettings>(keys.settings);
          if (current?.voiceReplies) speakReply(event.messageId, event.content, current.voiceReplyVoice);
        }
      }),
      onEvent('chat:followUps', ({ messageId, questions }) => useFollowUps.getState().set(messageId, questions)),
      onEvent('chat:changed', ({ conversationId }) => {
        void qc.invalidateQueries({ queryKey: ['conversations'] });
        if (conversationId) {
          void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
          void qc.invalidateQueries({ queryKey: keys.conversationArtifacts(conversationId) });
        }
        void qc.invalidateQueries({ queryKey: keys.artifacts });
      }),
      onEvent('models:changed', () => {
        void qc.invalidateQueries({ queryKey: keys.models });
        void qc.invalidateQueries({ queryKey: ['model-detail'] });
      }),
      onEvent('providers:status', (statuses) => qc.setQueryData(keys.providers, statuses)),
      onEvent('downloads:changed', (jobs) => qc.setQueryData(keys.downloads, jobs)),
      onEvent('settings:changed', (settings) => qc.setQueryData(keys.settings, settings)),
      onEvent('projects:changed', ({ projectId }) => {
        void qc.invalidateQueries({ queryKey: keys.projects });
        if (projectId) void qc.invalidateQueries({ queryKey: keys.project(projectId) });
        else void qc.invalidateQueries({ queryKey: ['project'] });
      }),
      onEvent('projects:index', (status) => {
        qc.setQueryData(keys.project(status.projectId), (old: ProjectDetail | undefined) => (old ? { ...old, index: status } : old));
      }),
      onEvent('customize:changed', ({ kind }) => {
        if (kind === 'skills' || kind === 'plugins') void qc.invalidateQueries({ queryKey: keys.skills });
        if (kind === 'plugins') void qc.invalidateQueries({ queryKey: keys.plugins });
        if (kind === 'commands' || kind === 'plugins') void qc.invalidateQueries({ queryKey: ['commands'] });
        if (kind === 'memory') {
          void qc.invalidateQueries({ queryKey: keys.memory });
          void qc.invalidateQueries({ queryKey: keys.memoryTopics });
        }
      }),
      onEvent('math:changed', ({ conversationId }) => {
        void qc.invalidateQueries({ queryKey: ['boards'] });
        void qc.invalidateQueries({ queryKey: ['board', conversationId] });
      }),
      onEvent('study:changed', () => void qc.invalidateQueries({ queryKey: ['books'] })),
      onEvent('connectors:changed', (list) => qc.setQueryData(keys.connectors, list)),
      onEvent('scheduled:changed', () => {
        void qc.invalidateQueries({ queryKey: keys.scheduled });
        void qc.invalidateQueries({ queryKey: ['scheduled-runs'] });
      }),
      onEvent('update:changed', (state) => qc.setQueryData(keys.update, state)),
      // A module asked for something to be read aloud, whether or not spoken replies are on.
      onEvent('voice:speak', ({ text }) => speak(text, qc.getQueryData<AppSettings>(keys.settings)?.voiceReplyVoice ?? '')),
    ];
    void invoke('chat:activeStreams').then((streams) => streams.forEach(applyStream));
    return () => offs.forEach((off) => off());
  }, [qc, applyStream]);
}
