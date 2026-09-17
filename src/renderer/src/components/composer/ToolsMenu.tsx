import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AppWindow, Brain, Globe, Info, ListChecks, Plug, Settings2, ShieldCheck, Sparkles, SquareTerminal } from 'lucide-react';
import type { ToolScope } from '@shared/types/customize';
import type { ModelRef } from '@shared/types/models';
import type { AppSettings } from '@shared/types/settings';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Badge, Spinner, StatusDot } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { useConnectors, useSettings, useSkills } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn('relative ml-auto h-4 w-7 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-track')}>
      <span className={cn('absolute top-0.5 size-3 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[14px]' : 'translate-x-0.5')} />
    </span>
  );
}

const APPROVAL_MODES: Array<{ value: AppSettings['approvalMode']; label: string; hint: string }> = [
  { value: 'manual', label: 'Manual', hint: 'Ask me every time' },
  { value: 'auto', label: 'Auto', hint: 'A quick, context-free model review decides' },
  { value: 'bypass', label: 'Bypass', hint: 'Never ask — everything runs' },
];

/** How any tool call that would normally ask first gets approved, plus the browser's own step cap. */
function ApprovalSubmenu({ settings, keepOpen }: { settings: AppSettings; keepOpen: (e: Event) => void }) {
  const setSteps = (delta: number) => void invoke('settings:update', { browserMaxSteps: Math.min(200, Math.max(5, settings.browserMaxSteps + delta)) });
  return (
    <MenuSub label="Action approval" icon={<ShieldCheck />}>
      {APPROVAL_MODES.map((mode) => (
        <MenuCheckItem
          key={mode.value}
          checked={settings.approvalMode === mode.value}
          onSelect={(e) => {
            keepOpen(e);
            void invoke('settings:update', { approvalMode: mode.value });
          }}
        >
          <span className="flex flex-col">
            <span>{mode.label}</span>
            <span className="text-[11.5px] text-muted-foreground">{mode.hint}</span>
          </span>
        </MenuCheckItem>
      ))}
      <MenuSeparator />
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="text-[12.5px] text-muted-foreground">Browser max steps</span>
        <div className="flex items-center gap-1.5">
          <button type="button" className="flex size-5 items-center justify-center rounded text-foreground hover:bg-hover" onClick={() => setSteps(-5)}>
            −
          </button>
          <span className="w-6 text-center text-[12.5px] text-foreground tabular-nums">{settings.browserMaxSteps}</span>
          <button type="button" className="flex size-5 items-center justify-center rounded text-foreground hover:bg-hover" onClick={() => setSteps(5)}>
            +
          </button>
        </div>
      </div>
    </MenuSub>
  );
}

/** Web search, connectors, skills and memory switches next to the composer's + button. */
export function ToolsMenu({ scope, onShowTools }: { scope: ToolScope; onShowTools: () => void }) {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: connectors = [] } = useConnectors();
  const { data: skills = [] } = useSkills();
  const { browserOpen, setBrowserOpen } = useUi();
  if (!settings) return null;
  const webOn = scope === 'chat' ? settings.chatWebSearch : settings.coworkWebAccess;
  const activeConnectors = connectors.filter((c) => c.config.enabled);
  const enabledSkills = skills.filter((s) => s.enabled && !s.error).length;
  const keepOpen = (e: Event) => e.preventDefault();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button aria-label="Tools" data-testid="tools-menu" className="no-drag relative flex size-8 items-center justify-center rounded-lg text-fg-2 hover:bg-hover hover:text-foreground">
          <Settings2 className="size-[17px]" strokeWidth={1.75} />
          {activeConnectors.length > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand" />}
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-72">
        <MenuItem
          icon={<Globe />}
          onSelect={(e) => {
            keepOpen(e);
            void invoke('settings:update', scope === 'chat' ? { chatWebSearch: !webOn } : { coworkWebAccess: !webOn });
          }}
        >
          <span className="flex w-full items-center gap-2">
            Web search
            <Toggle on={webOn} />
          </span>
        </MenuItem>
        <MenuItem
          icon={<Brain />}
          onSelect={(e) => {
            keepOpen(e);
            void invoke('settings:update', { memoryEnabled: !settings.memoryEnabled });
          }}
        >
          <span className="flex w-full items-center gap-2">
            Memory
            <Toggle on={settings.memoryEnabled} />
          </span>
        </MenuItem>
        {scope === 'chat' && (
          <MenuItem
            icon={<SquareTerminal />}
            onSelect={(e) => {
              keepOpen(e);
              void invoke('settings:update', { chatCommands: !settings.chatCommands });
            }}
          >
            <span className="flex w-full items-center gap-2">
              Run commands
              <Toggle on={settings.chatCommands} />
            </span>
          </MenuItem>
        )}
        <ApprovalSubmenu settings={settings} keepOpen={keepOpen} />
        <MenuItem
          icon={<AppWindow />}
          onSelect={(e) => {
            keepOpen(e);
            void invoke('settings:update', { browserEnabled: !settings.browserEnabled });
          }}
        >
          <span className="flex w-full items-center gap-2">
            Built-in browser
            <Toggle on={settings.browserEnabled} />
          </span>
        </MenuItem>
        <MenuItem icon={<AppWindow />} onSelect={() => setBrowserOpen(!browserOpen)}>
          {browserOpen ? 'Hide the browser panel' : 'Open the browser panel'}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Connectors</MenuLabel>
        {connectors.length === 0 && <div className="px-2 pb-1 text-[12.5px] text-muted-foreground">No connectors yet.</div>}
        {connectors.map((c) => (
          <MenuItem
            key={c.config.id}
            icon={<Plug />}
            onSelect={(e) => {
              keepOpen(e);
              void invoke('connectors:setEnabled', c.config.id, !c.config.enabled);
            }}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <StatusDot state={c.state === 'connected' ? 'online' : c.state === 'connecting' ? 'loading' : c.state === 'error' ? 'warning' : 'offline'} />
              <span className="truncate">{c.config.name}</span>
              {c.state === 'connected' && <span className="text-[11px] text-muted-foreground">{c.tools.length}</span>}
              <Toggle on={c.config.enabled} />
            </span>
          </MenuItem>
        ))}
        <MenuItem icon={<Settings2 />} onSelect={() => void navigate({ to: '/customize/$section', params: { section: 'connectors' } })}>
          Manage connectors
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Sparkles />} onSelect={() => void navigate({ to: '/customize/$section', params: { section: 'skills' } })}>
          <span className="flex w-full items-center gap-2">
            Skills
            <span className="ml-auto text-[12px] text-muted-foreground">{enabledSkills} on</span>
          </span>
        </MenuItem>
        <MenuItem icon={<ListChecks />} onSelect={onShowTools}>
          See all tools
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** `/tools`: every tool the model gets here, grouped by where it comes from. */
export function ToolsDialog({ open, onOpenChange, scope, conversationId, model }: { open: boolean; onOpenChange: (open: boolean) => void; scope: ToolScope; conversationId?: string; model?: ModelRef }) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['tools', scope, conversationId ?? '', model?.providerId ?? '', model?.modelId ?? ''],
    queryFn: () => invoke('tools:list', scope, conversationId, model),
    enabled: open,
    staleTime: 0,
  });
  const groups = new Map<string, NonNullable<typeof data>['tools']>();
  for (const tool of data?.tools ?? []) groups.set(tool.group, [...(groups.get(tool.group) ?? []), tool]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Tools" description={`What the model can use in this ${scope === 'code' ? 'session' : scope === 'task' ? 'task' : 'chat'}.`} className="w-[min(620px,calc(100vw-40px))]">
      <div data-testid="tools-dialog">
        {isLoading && <Spinner />}
        {error && <div className="text-[13px] text-danger">{error instanceof Error ? error.message : String(error)}</div>}
        {data?.notes.map((note) => (
          <div key={note} className="mb-2 flex items-start gap-2 rounded-lg border border-divider bg-card px-3 py-2 text-[12.5px] text-fg-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            {note}
          </div>
        ))}
        {data && data.tools.length === 0 && <div className="py-4 text-[13px] text-muted-foreground">No tools are available here. Turn on web search, add a connector or enable a skill.</div>}
        {[...groups.entries()].map(([group, tools]) => (
          <section key={group} className="mt-3">
            <h3 className="mb-1 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
              {group}
              {tools[0].kind === 'connector' && <Badge tone="outline">Connector</Badge>}
            </h3>
            <div className="divide-y divide-divider rounded-lg border border-divider">
              {tools.map((tool) => (
                <div key={tool.name} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12.5px] text-foreground">{tool.name}</span>
                    {tool.policy === 'allow' && <Badge tone="success">Runs without asking</Badge>}
                    {tool.policy === 'ask' && <Badge tone="outline">Asks first</Badge>}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{tool.description}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="mt-4 flex gap-3 text-[13px]">
          <button
            className="text-brand hover:underline"
            onClick={() => {
              onOpenChange(false);
              void navigate({ to: '/customize/$section', params: { section: 'connectors' } });
            }}
          >
            Manage connectors
          </button>
          <button
            className="text-brand hover:underline"
            onClick={() => {
              onOpenChange(false);
              void navigate({ to: '/customize/$section', params: { section: 'skills' } });
            }}
          >
            Manage skills
          </button>
        </div>
      </div>
    </Dialog>
  );
}
