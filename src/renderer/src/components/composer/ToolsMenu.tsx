import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AppWindow, Brain, Ellipsis, Globe, Info, ListChecks, MessagesSquare, MousePointerClick, Plug, Settings2, ShieldCheck, Sparkles, SquareTerminal } from 'lucide-react';
import type { ToolScope } from '@shared/types/customize';
import type { ModelRef } from '@shared/types/models';
import type { AppSettings } from '@shared/types/settings';
import { Dialog } from '@/components/ui/dialog';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { Badge, Spinner, StatusDot, Tip } from '@/components/ui/misc';
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

type SwitchKey = 'web' | 'memoryEnabled' | 'chatCommands' | 'browserEnabled' | 'computerUse' | 'followUps';
type SwitchGroup = 'does' | 'context' | 'extras';
interface Switch {
  key: SwitchKey;
  label: string;
  short: string;
  icon: React.ReactNode;
  group: SwitchGroup;
  on: boolean;
  patch: Partial<AppSettings>;
}

/** The per-chat switches, in one place so the menu and the composer's chips agree. */
function switchesFor(scope: ToolScope, settings: AppSettings | undefined): Switch[] {
  if (!settings) return [];
  const webOn = scope === 'chat' ? settings.chatWebSearch : settings.coworkWebAccess;
  const all: Switch[] = [
    { key: 'web', label: 'Web search', short: 'Web', icon: <Globe />, group: 'does', on: webOn, patch: scope === 'chat' ? { chatWebSearch: !webOn } : { coworkWebAccess: !webOn } },
    { key: 'chatCommands', label: 'Run commands', short: 'Commands', icon: <SquareTerminal />, group: 'does', on: settings.chatCommands, patch: { chatCommands: !settings.chatCommands } },
    { key: 'browserEnabled', label: 'Built-in browser', short: 'Browser', icon: <AppWindow />, group: 'does', on: settings.browserEnabled, patch: { browserEnabled: !settings.browserEnabled } },
    { key: 'computerUse', label: 'Use the computer', short: 'Computer', icon: <MousePointerClick />, group: 'does', on: settings.computerUse, patch: { computerUse: !settings.computerUse } },
    { key: 'memoryEnabled', label: 'Memory', short: 'Memory', icon: <Brain />, group: 'context', on: settings.memoryEnabled, patch: { memoryEnabled: !settings.memoryEnabled } },
    { key: 'followUps', label: 'Follow-up suggestions', short: 'Follow-ups', icon: <MessagesSquare />, group: 'extras', on: settings.followUps, patch: { followUps: !settings.followUps } },
  ];
  return all.filter(
    (s) =>
      (scope === 'chat' || (s.key !== 'chatCommands' && s.key !== 'followUps')) &&
      // Computer use drives the desktop; Math, Design and Study work on their own canvas.
      (s.key !== 'computerUse' || scope === 'chat' || scope === 'task' || scope === 'code'),
  );
}

/** Small chips beside the tools button for whatever is switched on; clicking one turns it off. */
export function ActiveToolChips({ scope }: { scope: ToolScope }) {
  const { data: settings } = useSettings();
  const { data: connectors = [] } = useConnectors();
  const on = switchesFor(scope, settings).filter((s) => s.on);
  const liveConnectors = connectors.filter((c) => c.config.enabled).length;
  if (!on.length && !liveConnectors) return null;
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-brand/10 px-1 text-brand" data-testid="active-tools">
      {on.map((s) => (
        <Tip key={s.key} label={`${s.label} is on · click to turn off`}>
          <button
            aria-label={`Turn off ${s.label}`}
            onClick={() => void invoke('settings:update', s.patch)}
            className="no-drag flex size-5 items-center justify-center rounded-full transition hover:bg-brand/20 [&_svg]:size-3.5"
          >
            {s.icon}
          </button>
        </Tip>
      ))}
      {liveConnectors > 0 && (
        <Tip label={`${liveConnectors} connector${liveConnectors === 1 ? '' : 's'} on`}>
          <span className="flex h-5 items-center gap-0.5 px-1 text-[11.5px] tabular-nums [&_svg]:size-3.5">
            <Plug />
            {liveConnectors}
          </span>
        </Tip>
      )}
    </div>
  );
}

/** Per-chat switches, connectors and skills next to the composer's + button, grouped by what they change. */
export function ToolsMenu({ scope, onShowTools }: { scope: ToolScope; onShowTools: () => void }) {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: connectors = [] } = useConnectors();
  const { data: skills = [] } = useSkills();
  const { browserOpen, setBrowserOpen } = useUi();
  if (!settings) return null;
  const switches = switchesFor(scope, settings);
  const activeConnectors = connectors.filter((c) => c.config.enabled);
  const enabledSkills = skills.filter((s) => s.enabled && !s.error).length;
  const keepOpen = (e: Event) => e.preventDefault();
  const renderSwitches = (group: SwitchGroup) =>
    switches
      .filter((s) => s.group === group)
      .map((s) => (
        <MenuItem
          key={s.key}
          icon={s.icon}
          onSelect={(e) => {
            keepOpen(e);
            void invoke('settings:update', s.patch);
          }}
        >
          <span className="flex w-full items-center gap-2">
            {s.label}
            <Toggle on={s.on} />
          </span>
        </MenuItem>
      ));
  return (
    <Menu>
      <MenuTrigger asChild>
        <button aria-label="Tools" data-testid="tools-menu" className="no-drag relative flex size-8 items-center justify-center rounded-lg text-fg-2 hover:bg-hover hover:text-foreground">
          <Settings2 className="size-[17px]" strokeWidth={1.75} />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-72">
        <MenuLabel>Model can</MenuLabel>
        {renderSwitches('does')}
        <MenuSeparator />
        <MenuLabel>Context</MenuLabel>
        {renderSwitches('context')}
        <MenuItem icon={<Sparkles />} onSelect={() => void navigate({ to: '/customize/$section', params: { section: 'skills' } })}>
          <span className="flex w-full items-center gap-2">
            Skills
            <span className="ml-auto text-[12px] text-muted-foreground">{enabledSkills} on</span>
          </span>
        </MenuItem>
        {scope === 'chat' && (
          <>
            <MenuSeparator />
            <MenuLabel>Chat extras</MenuLabel>
            {renderSwitches('extras')}
          </>
        )}
        <MenuSeparator />
        <MenuSub label={activeConnectors.length ? `Connectors · ${activeConnectors.length} on` : 'Connectors'} icon={<Plug />}>
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
          <MenuSeparator />
          <MenuItem icon={<Settings2 />} onSelect={() => void navigate({ to: '/customize/$section', params: { section: 'connectors' } })}>
            Manage connectors
          </MenuItem>
        </MenuSub>
        <ApprovalSubmenu settings={settings} keepOpen={keepOpen} />
        <MenuSub label="More" icon={<Ellipsis />}>
          <MenuItem icon={<AppWindow />} onSelect={() => setBrowserOpen(!browserOpen)}>
            {browserOpen ? 'Hide the browser panel' : 'Open the browser panel'}
          </MenuItem>
          <MenuItem icon={<ListChecks />} onSelect={onShowTools}>
            See all tools
          </MenuItem>
        </MenuSub>
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
