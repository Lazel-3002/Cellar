import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowDown, ChevronDown, FolderClosed, Ghost, Pencil, Star, Trash } from 'lucide-react';
import { branchPath, siblingsOf } from '@shared/message-tree';
import type { Conversation } from '@shared/types/chat';
import { AssistantMessage, UserMessage } from '@/components/chat/Messages';
import { Composer } from '@/components/composer/Composer';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useConversation, useModels, useProjects } from '@/lib/queries';
import { formatContext } from '@/lib/utils';
import { isLive, useStreams } from '@/stores/streams';
import { useUi } from '@/stores/ui';

function ChatHeader({ conversation, contextUsed, contextMax }: { conversation: Conversation; contextUsed?: number; contextMax?: number }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const project = projects.find((p) => p.id === conversation.projectId);
  useEffect(() => setTitle(conversation.title), [conversation.title]);

  const commit = () => {
    setRenaming(false);
    if (title.trim() && title !== conversation.title) void invoke('chat:rename', conversation.id, title);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
      {project && (
        <button className="no-drag flex items-center gap-1.5 text-[13.5px] text-muted-foreground hover:text-foreground" onClick={() => void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}>
          <FolderClosed className="size-3.5" />
          {project.name}
          <span className="text-faint">/</span>
        </button>
      )}
      {conversation.incognito && (
        <Badge tone="outline" className="gap-1">
          <Ghost className="size-3" /> Incognito
        </Badge>
      )}
      {renaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="no-drag h-7 w-80 rounded-md border border-brand/50 bg-composer px-2 text-[14px] outline-none"
        />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <button className="no-drag flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground">
              <span className="truncate">{conversation.title || 'New chat'}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </MenuTrigger>
          <MenuContent>
            {!conversation.incognito && (
              <>
                <MenuItem icon={<Star />} onSelect={() => void invoke('chat:star', conversation.id, !conversation.starred)}>
                  {conversation.starred ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
                  Rename
                </MenuItem>
                <MenuSub label="Add to project" icon={<FolderClosed />}>
                  {projects.length === 0 && <MenuLabel>No projects yet</MenuLabel>}
                  {projects.map((p) => (
                    <MenuCheckItem key={p.id} checked={conversation.projectId === p.id} onSelect={() => void invoke('chat:moveToProject', conversation.id, conversation.projectId === p.id ? null : p.id)}>
                      {p.name}
                    </MenuCheckItem>
                  ))}
                </MenuSub>
                <MenuSeparator />
              </>
            )}
            <MenuItem
              icon={<Trash />}
              destructive
              onSelect={async () => {
                await invoke('chat:delete', [conversation.id]);
                void navigate({ to: '/' });
              }}
            >
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <div className="flex-1" />
      {contextUsed && contextMax ? (
        <span className="mr-2 hidden text-[12px] text-muted-foreground tabular-nums md:inline" title="Tokens used by the last exchange / loaded context length">
          {formatContext(contextUsed)} / {formatContext(contextMax)} context
        </span>
      ) : null}
    </div>
  );
}

export function ChatPage() {
  const { conversationId } = useParams({ from: '/chat/$conversationId' });
  const navigate = useNavigate();
  const { data, isLoading, error } = useConversation(conversationId);
  const { data: models = [] } = useModels();
  const streams = useStreams((s) => s.byMessage);
  const setIncognito = useUi((s) => s.setIncognito);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const incognitoRef = useRef(false);

  useLayoutEffect(() => setSlot(document.getElementById('titlebar-slot')), []);

  useEffect(() => {
    if (!data) return;
    incognitoRef.current = data.conversation.incognito;
    setIncognito(data.conversation.incognito);
  }, [data?.conversation.incognito, data, setIncognito]);

  // Leaving an incognito chat throws it away.
  useEffect(
    () => () => {
      if (incognitoRef.current) void invoke('chat:discardIncognito', conversationId);
    },
    [conversationId],
  );

  const path = useMemo(() => (data ? branchPath(data.messages, data.conversation.currentLeafId) : []), [data]);
  const streamingMessage = path.find((m) => m.role === 'assistant' && m.status === 'streaming' && (!streams[m.id] || isLive(streams[m.id])));
  const lastLive = path.length ? streams[path[path.length - 1].id] : undefined;
  const scrollSignal = `${path.length}:${lastLive?.content.length ?? 0}:${lastLive?.reasoning.length ?? 0}:${lastLive?.status ?? ''}`;

  useEffect(() => {
    if (atBottom && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [scrollSignal, atBottom]);

  useEffect(() => {
    setAtBottom(true);
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }, [conversationId]);

  const lastAssistant = [...path].reverse().find((m) => m.role === 'assistant' && m.stats);
  const usedModel = lastAssistant?.model ? models.find((m) => m.ref.providerId === lastAssistant.model!.providerId && m.ref.modelId === lastAssistant.model!.modelId) : undefined;
  const contextUsed = lastAssistant?.stats?.promptTokens && lastAssistant.stats.completionTokens ? lastAssistant.stats.promptTokens + lastAssistant.stats.completionTokens : undefined;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        className="h-full"
        icon={<Ghost className="size-5" />}
        title="This chat is gone"
        description="It may have been deleted, or it was an incognito chat that ended."
        action={
          <button className="text-[13.5px] text-brand" onClick={() => void navigate({ to: '/' })}>
            Start a new chat
          </button>
        }
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {slot && createPortal(<ChatHeader conversation={data.conversation} contextUsed={contextUsed} contextMax={usedModel?.loadedContextLength} />, slot)}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
        className="min-h-0 flex-1 overflow-y-auto pt-9"
      >
        <div className="mx-auto flex w-full max-w-[768px] flex-col gap-7 px-6 pt-6 pb-10">
          {path.map((message, i) => {
            const siblings = siblingsOf(data.messages, message);
            return message.role === 'user' ? (
              <UserMessage key={message.id} message={message} conversation={data.conversation} siblings={siblings} disabled={!!streamingMessage} />
            ) : (
              <AssistantMessage key={message.id} message={message} live={streams[message.id]} conversation={data.conversation} siblings={siblings} isLast={i === path.length - 1} />
            );
          })}
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-[768px] px-6 pb-3">
        {!atBottom && (
          <button
            aria-label="Jump to latest"
            onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
            className="absolute -top-11 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-composer-border bg-composer text-fg-2 shadow-lg hover:text-foreground"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
        <Composer
          variant="chat"
          conversationId={data.conversation.id}
          projectId={data.conversation.projectId}
          incognito={data.conversation.incognito}
          streamingMessageId={streamingMessage?.id ?? null}
          autoFocus
        />
        <div className="mt-2 text-center text-[11.5px] text-muted-foreground">Cellar runs models on your computer. They can make mistakes, so double-check important answers.</div>
      </div>
    </div>
  );
}
