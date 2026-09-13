import type { Message } from './types/chat';

/** Messages from the root to `leafId`, following parent links. */
export function branchPath(messages: Message[], leafId: string | null | undefined): Message[] {
  if (!leafId) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const path: Message[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

export function childrenOf(messages: Message[], parentId: string | null): Message[] {
  return messages.filter((m) => m.parentId === parentId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Alternatives for a message: all messages sharing its parent, oldest first. */
export function siblingsOf(messages: Message[], message: Message): Message[] {
  return childrenOf(messages, message.parentId);
}

/** Follow the newest child from `startId` down to a leaf. */
export function latestLeaf(messages: Message[], startId: string): string {
  let currentId = startId;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(currentId)) return currentId;
    seen.add(currentId);
    const children = childrenOf(messages, currentId);
    if (children.length === 0) return currentId;
    currentId = children[children.length - 1].id;
  }
}
