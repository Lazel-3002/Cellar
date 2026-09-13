import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ThinkingLevel } from '@shared/types/chat';
import type { ModelEntry, ReasoningStyle } from '@shared/types/models';
import type { AppSettings } from '@shared/types/settings';
import { useUi } from '../stores/ui';
import { invoke, onEvent } from './ipc';
import { useModels, useSettings } from './queries';

/** Apply theme, accent and chat font from settings to the document and native title bar. */
export function useThemeSync(settings: AppSettings | undefined): void {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.setProperty('--brand', settings.accent);
    root.style.setProperty(
      '--chat-font',
      settings.chatFont === 'sans'
        ? "'Inter Variable', 'Segoe UI', system-ui, sans-serif"
        : settings.chatFont === 'system'
          ? "system-ui, 'Segoe UI', sans-serif"
          : "'Source Serif 4 Variable', Georgia, 'Times New Roman', serif",
    );
    root.style.setProperty('--titlebar-reserve', window.cellar.platform === 'darwin' ? '0px' : '140px');
    void invoke('window:setTheme', theme);
  }, [settings?.theme, settings?.accent, settings?.chatFont, systemDark, settings]);
}

/** Handle accelerator commands coming from the (hidden) native menu. */
export function useAppCommands(): void {
  const navigate = useNavigate();
  const { toggleSidebar, setSearchOpen, setIncognito } = useUi();
  useEffect(
    () =>
      onEvent('app:command', ({ command }) => {
        switch (command) {
          case 'new-chat':
            setIncognito(false);
            void navigate({ to: '/' });
            break;
          case 'new-incognito':
            setIncognito(true);
            void navigate({ to: '/' });
            break;
          case 'search':
            setSearchOpen(true);
            break;
          case 'settings':
            void navigate({ to: '/settings/$section', params: { section: 'general' } });
            break;
          case 'toggle-sidebar':
            toggleSidebar();
            break;
          case 'models':
            void navigate({ to: '/models' });
            break;
          case 'discover':
            void navigate({ to: '/discover' });
            break;
        }
      }),
    [navigate, toggleSidebar, setSearchOpen, setIncognito],
  );
}

export function isChatCapable(m: ModelEntry): boolean {
  return !m.capabilities.embedding;
}

/** The model the composer should use: explicit choice → settings default → loaded → first available. */
export function useSelectedModel(): { model: ModelEntry | null; models: ModelEntry[]; isLoading: boolean } {
  const { data: models = [], isLoading } = useModels();
  const { data: settings } = useSettings();
  const chosen = useUi((s) => s.model);
  const model = useMemo(() => {
    const chat = models.filter(isChatCapable);
    const find = (ref?: { providerId: string; modelId: string } | null) => (ref ? chat.find((m) => m.ref.providerId === ref.providerId && m.ref.modelId === ref.modelId) : undefined);
    return find(chosen) ?? find(settings?.defaultModel) ?? chat.find((m) => m.loaded) ?? chat[0] ?? null;
  }, [models, chosen, settings?.defaultModel]);
  return { model, models, isLoading };
}

export function thinkingOptions(style: ReasoningStyle): Array<{ value: ThinkingLevel; label: string }> {
  if (style === 'toggle') return [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }];
  if (style === 'effort') return [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];
  return [];
}

/** Clamp the stored thinking level to what the model supports. */
export function effectiveThinking(style: ReasoningStyle, level: ThinkingLevel): ThinkingLevel {
  const options = thinkingOptions(style);
  if (options.length === 0) return style === 'always' ? 'on' : 'off';
  if (options.some((o) => o.value === level)) return level;
  if (style === 'toggle') return level === 'off' ? 'off' : 'on';
  return level === 'off' ? 'low' : 'medium';
}

export function thinkingLabel(style: ReasoningStyle, level: ThinkingLevel): string {
  if (style === 'none') return '';
  if (style === 'always') return 'Thinking';
  const value = effectiveThinking(style, level);
  if (style === 'toggle') return value === 'off' ? '' : 'Thinking';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
