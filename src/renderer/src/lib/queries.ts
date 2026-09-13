import { useEffect } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationFilter } from '@shared/types/chat';
import type { HfSearchQuery } from '@shared/types/hub';
import type { ModelRef } from '@shared/types/models';
import type { AppSettings, AppSettingsPatch } from '@shared/types/settings';
import { useStreams } from '../stores/streams';
import { invoke, onEvent } from './ipc';

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

/** Subscribes to main-process events once and keeps the query cache in sync. */
export function useIpcSync(): void {
  const qc = useQueryClient();
  const applyStream = useStreams((s) => s.apply);

  useEffect(() => {
    const offs = [
      onEvent('chat:stream', (event) => applyStream(event)),
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
    ];
    void invoke('chat:activeStreams').then((streams) => streams.forEach(applyStream));
    return () => offs.forEach((off) => off());
  }, [qc, applyStream]);
}
