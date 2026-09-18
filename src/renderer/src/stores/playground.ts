import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThinkingLevel } from '@shared/types/chat';
import type { ModelRef } from '@shared/types/models';
import { invoke } from '@/lib/ipc';
import { isLive, useStreams } from './streams';

export type Side = 'a' | 'b';

export const SIDES: readonly Side[] = ['a', 'b'];

/** A title up front keeps the two chats out of auto-titling, which would cost an extra generation each. */
const TITLE = 'Playground';

export interface SideSetup {
  ref: ModelRef;
  thinking: ThinkingLevel;
}

/** What one model did with one prompt: an answer, a turn that never started, or a send that failed. */
export interface RoundCell {
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

export interface Round {
  id: string;
  prompt: string;
  cells: Record<Side, RoundCell>;
}

interface PlaygroundState {
  models: Record<Side, ModelRef | null>;
  /** Incognito conversations, one per side, created with the first prompt. */
  conversations: Record<Side, string | null>;
  rounds: Round[];
  /** The side generating right now, or null between runs. `messageId` is null until its send returns. */
  active: { side: Side; messageId: string | null } | null;
  setModel: (side: Side, ref: ModelRef) => void;
  run: (prompt: string, setup: Record<Side, SideSetup>) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

// Set by stop() and clear(); read between sides so ending one turn does not start the next model.
let cancelled = false;

/** Resolves when the message reaches a final state. Every turn ends with one such event. */
function settled(messageId: string): Promise<void> {
  const finished = () => {
    const event = useStreams.getState().byMessage[messageId];
    return !!event && !isLive(event);
  };
  if (finished()) return Promise.resolve();
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = useStreams.subscribe(() => {
      if (!finished()) return;
      unsubscribe();
      resolve();
    });
  });
}

export const usePlayground = create<PlaygroundState>()(
  persist(
    (set, get) => ({
      models: { a: null, b: null },
      conversations: { a: null, b: null },
      rounds: [],
      active: null,

      setModel: (side, ref) => set((s) => ({ models: { ...s.models, [side]: ref } })),

      // One model at a time: they share the same GPU, and a model answering on its own is the
      // speed the user would actually get.
      run: async (prompt, setup) => {
        if (get().active) return;
        cancelled = false;
        const id = `${Date.now()}`;
        set((s) => ({ rounds: [...s.rounds, { id, prompt, cells: { a: {}, b: {} } }] }));
        const patch = (side: Side, cell: RoundCell) =>
          set((s) => ({ rounds: s.rounds.map((r) => (r.id === id ? { ...r, cells: { ...r.cells, [side]: { ...r.cells[side], ...cell } } } : r)) }));

        for (const side of SIDES) {
          if (cancelled) {
            patch(side, { skipped: true });
            continue;
          }
          set({ active: { side, messageId: null } });
          try {
            const result = await invoke('chat:send', {
              conversationId: get().conversations[side] ?? undefined,
              incognito: true,
              title: TITLE,
              content: prompt,
              attachmentIds: [],
              model: setup[side].ref,
              thinking: setup[side].thinking,
            });
            set((s) => ({
              conversations: { ...s.conversations, [side]: result.conversationId },
              active: { side, messageId: result.assistantMessageId },
            }));
            patch(side, { messageId: result.assistantMessageId });
            // Stopped while the send was in flight: end this turn but keep whatever it wrote.
            if (cancelled) await invoke('chat:stop', result.assistantMessageId);
            else await settled(result.assistantMessageId);
          } catch (err) {
            patch(side, { error: err instanceof Error ? err.message : String(err) });
          }
        }
        set({ active: null });
      },

      stop: () => {
        cancelled = true;
        const messageId = get().active?.messageId;
        if (messageId) void invoke('chat:stop', messageId);
      },

      clear: () => {
        get().stop();
        for (const side of SIDES) {
          const id = get().conversations[side];
          if (id) void invoke('chat:discardIncognito', id);
        }
        set({ conversations: { a: null, b: null }, rounds: [], active: null });
      },
    }),
    {
      name: 'cellar-playground',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ models: s.models }),
    },
  ),
);
