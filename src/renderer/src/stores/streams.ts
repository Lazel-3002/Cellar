import { create } from 'zustand';
import type { ChatStreamEvent } from '@shared/types/chat';

interface StreamsState {
  byMessage: Record<string, ChatStreamEvent>;
  apply: (event: ChatStreamEvent) => void;
  clear: (messageId: string) => void;
}

// Coalesce bursts of token events into one store update per frame. requestAnimationFrame is
// paused while the window is hidden or occluded, so a timer backs it up.
let pending = new Map<string, ChatStreamEvent>();
let scheduled = false;

export const useStreams = create<StreamsState>((set) => {
  const flush = () => {
    if (!scheduled) return;
    scheduled = false;
    const batch = pending;
    pending = new Map();
    set((state) => {
      const next = { ...state.byMessage };
      for (const [id, e] of batch) next[id] = e;
      return { byMessage: next };
    });
  };
  return {
    byMessage: {},
    apply: (event) => {
      pending.set(event.messageId, event);
      if (scheduled) return;
      scheduled = true;
      if (document.visibilityState === 'visible') requestAnimationFrame(flush);
      setTimeout(flush, 60);
    },
    clear: (messageId) =>
      set((state) => {
        const next = { ...state.byMessage };
        delete next[messageId];
        return { byMessage: next };
      }),
  };
});

export const isLive = (event?: ChatStreamEvent) => !!event && (event.status === 'streaming' || event.status === 'loading-model');
