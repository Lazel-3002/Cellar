import { create } from 'zustand';

/** Suggested follow-up questions per assistant message. Session-only: they go stale once the chat moves on. */
interface FollowUpsState {
  byMessage: Record<string, string[]>;
  set: (messageId: string, questions: string[]) => void;
  clear: (messageId: string) => void;
}

export const useFollowUps = create<FollowUpsState>((set) => ({
  byMessage: {},
  set: (messageId, questions) => set((s) => ({ byMessage: { ...s.byMessage, [messageId]: questions } })),
  clear: (messageId) =>
    set((s) => {
      const next = { ...s.byMessage };
      delete next[messageId];
      return { byMessage: next };
    }),
}));
