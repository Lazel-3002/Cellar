import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronRight, Ellipsis, FolderOpen, Import, Pencil, Plug, Plus, Puzzle, RefreshCw, Sparkles, SquareSlash, Trash } from 'lucide-react';
import { toast } from 'sonner';
import type { CommandInfo, ConnectorInput, ConnectorStatus, ConnectorTransport, SkillInfo, ToolPolicy } from '@shared/types/customize';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Badge, EmptyState, Spinner, StatusDot } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { keys, useBackground, useCommands, useConnectors, useMemories, usePlugins, useSettings, useSkills, useUpdateSettings } from '@/lib/queries';
import { cn, relativeTime } from '@/lib/utils';

const SECTIONS = [
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'commands', label: 'Commands', icon: SquareSlash },
  { id: 'memory', label: 'Memory', icon: Brain },
] as const;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast.success(success);
    return result;
  } catch (err) {
    toast.error(errorText(err));
    return undefined;
  }
}

function Header({ title, description, actions }: { title: string; description: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-[520px]">
        <h1 className="font-serif text-[28px] leading-tight">{title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function Card({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn('rounded-xl border border-divider bg-card px-4 py-3', className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills

function SkillDialog({ skill, open, onOpenChange }: { skill: SkillInfo | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (!skill) {
      setName('');
      setDescription('');
      setBody('');
      return;
    }
    void invoke('skills:get', skill.id).then((detail) => {
      setName(detail.name);
      setDescription(detail.description);
      setBody(detail.body);
    });
  }, [open, skill]);
  const save = async () => {
    setSaving(true);
    const saved = await attempt(() => invoke('skills:save', { id: skill?.id, name, description, body }), skill ? 'Skill saved' : 'Skill created');
    setSaving(false);
    if (saved) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={skill ? `Edit ${skill.name}` : 'New skill'}
      description="Skills are instructions a model loads when a request matches the description. Cellar saves them as SKILL.md files."
      className="w-[min(720px,calc(100vw-40px))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving || !name.trim() || !description.trim()} onClick={() => void save()} data-testid="save-skill">
            {saving && <Spinner className="size-3.5" />} Save skill
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="meeting-notes" data-testid="skill-name" />
        </label>
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">When to use it</span>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Turn raw meeting notes into a summary with decisions and action items. Use when the user shares meeting notes or a transcript." data-testid="skill-description" />
        </label>
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Instructions (Markdown)</span>
          <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[12.5px]" placeholder={'# Meeting notes\n\n1. Start with a three-sentence summary.\n2. List decisions.\n3. List action items as "- [ ] owner: task (due date)".'} data-testid="skill-body" />
        </label>
      </div>
    </Dialog>
  );
}

function SkillsSection() {
  const { data: skills = [], isLoading } = useSkills();
  const { data: background } = useBackground();
  const [editing, setEditing] = useState<SkillInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const importFrom = async () => {
    const path = await invoke('system:pickPath', 'skill');
    if (!path) return;
    const imported = await attempt(() => invoke('skills:import', path));
    if (imported) toast.success(`Imported ${imported.length} skill${imported.length === 1 ? '' : 's'}`);
  };
  return (
    <>
      <Header
        title="Skills"
        description="Folders with a SKILL.md that teach models how to do a kind of work. Models see each skill's description and load the full instructions when a request matches (tool-capable models in Chat, Cowork and Code)."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void invoke('skills:reveal')}>
              <FolderOpen className="size-3.5" /> Open folder
            </Button>
            <Button variant="outline" size="sm" onClick={() => void importFrom()}>
              <Import className="size-3.5" /> Import
            </Button>
            {background?.claudeSkills && (
              <Button variant="outline" size="sm" onClick={() => void attempt(() => invoke('skills:importClaude')).then((n) => n !== undefined && toast.success(n ? `Imported ${n} skill${n === 1 ? '' : 's'} from Claude Code` : 'No new skills to import'))}>
                Import from Claude Code
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              data-testid="new-skill"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-3.5" /> New skill
            </Button>
          </>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : skills.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-5" />} title="No skills yet" description="Create one, import a skill folder or .skill file, or install a plugin that brings skills." />
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <Card key={skill.id} testId="skill-row">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{skill.name}</span>
                    {skill.pluginName && <Badge tone="outline">{skill.pluginName}</Badge>}
                    {skill.files.length > 0 && <Badge>{skill.files.length} file{skill.files.length === 1 ? '' : 's'}</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{skill.description || 'No description'}</p>
                  {skill.error && <p className="mt-1 text-[12px] text-warning">{skill.error}</p>}
                </div>
                <Switch checked={skill.enabled} onCheckedChange={(v) => void attempt(() => invoke('skills:setEnabled', skill.id, v))} label={`Use ${skill.name}`} />
                <Menu>
                  <MenuTrigger asChild>
                    <button aria-label="Skill options" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
                      <Ellipsis className="size-4" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    {skill.source === 'user' && (
                      <MenuItem
                        icon={<Pencil />}
                        onSelect={() => {
                          setEditing(skill);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </MenuItem>
                    )}
                    <MenuItem icon={<FolderOpen />} onSelect={() => void invoke('skills:reveal', skill.id)}>
                      Open folder
                    </MenuItem>
                    {skill.source === 'user' && (
                      <>
                        <MenuSeparator />
                        <MenuItem icon={<Trash />} destructive onSelect={() => window.confirm(`Delete the ${skill.name} skill and its folder?`) && void attempt(() => invoke('skills:delete', skill.id), 'Skill deleted')}>
                          Delete
                        </MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              </div>
            </Card>
          ))}
        </div>
      )}
      <SkillDialog skill={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Connectors

const recordToText = (record: Record<string, string>, separator: string) =>
  Object.entries(record)
    .map(([k, v]) => `${k}${separator}${v}`)
    .join('\n');

function textToRecord(text: string, separator: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = separator.exec(line);
    if (!match || match.index === 0) continue;
    const key = line.slice(0, match.index).trim();
    if (key) out[key] = line.slice(match.index + match[0].length).trim();
  }
  return out;
}

/** Split an argument line like a shell would: quotes group words. */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  for (const match of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

const joinArgs = (args: string[]) => args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');

function ConnectorDialog({ connector, open, onOpenChange }: { connector: ConnectorStatus | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<ConnectorTransport>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = connector?.config;
    setName(c?.name ?? '');
    setTransport(c?.transport ?? 'stdio');
    setCommand(c?.command ?? '');
    setArgs(c ? joinArgs(c.args) : '');
    setEnv(c ? recordToText(c.env, '=') : '');
    setUrl(c?.url ?? '');
    setHeaders(c ? recordToText(c.headers, ': ') : '');
  }, [open, connector]);
  const save = async () => {
    const input: ConnectorInput = { id: connector?.config.id, name, transport, command, args: splitArgs(args), env: textToRecord(env, /=/), url, headers: textToRecord(headers, /:\s*/), enabled: connector?.config.enabled ?? true };
    setSaving(true);
    const saved = await attempt(() => invoke('connectors:save', input));
    setSaving(false);
    if (!saved) return;
    onOpenChange(false);
    if (saved.state === 'error') toast.error(`${saved.config.name} could not connect`, { description: saved.message });
    else toast.success(connector ? 'Connector saved' : `${saved.config.name} added`);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={connector ? `Edit ${connector.config.name}` : 'Add a connector'}
      description="Connectors are MCP servers. A local server is a program Cellar starts; a remote server is a URL."
      className="w-[min(620px,calc(100vw-40px))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving || !name.trim()} onClick={() => void save()} data-testid="save-connector">
            {saving && <Spinner className="size-3.5" />} {saving ? 'Connecting…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" data-testid="connector-name" />
        </label>
        <Segmented
          value={transport}
          onChange={setTransport}
          options={[
            { value: 'stdio', label: 'Local command' },
            { value: 'http', label: 'Remote URL' },
            { value: 'sse', label: 'Remote (SSE)' },
          ]}
        />
        {transport === 'stdio' ? (
          <>
            <label className="block">
              <span className="text-[12.5px] text-muted-foreground">Command</span>
              <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className="font-mono" data-testid="connector-command" />
            </label>
            <label className="block">
              <span className="text-[12.5px] text-muted-foreground">Arguments</span>
              <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder='-y @modelcontextprotocol/server-filesystem "C:\Users\me\Documents"' className="font-mono" data-testid="connector-args" />
            </label>
            <label className="block">
              <span className="text-[12.5px] text-muted-foreground">Environment variables (NAME=value, one per line; stored encrypted)</span>
              <Textarea rows={3} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="API_KEY=…" className="font-mono text-[12.5px]" />
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-[12.5px] text-muted-foreground">Server URL</span>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" className="font-mono" />
            </label>
            <label className="block">
              <span className="text-[12.5px] text-muted-foreground">Headers (Name: value, one per line; stored encrypted)</span>
              <Textarea rows={3} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Authorization: Bearer …" className="font-mono text-[12.5px]" />
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}

function ImportJsonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [json, setJson] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Paste MCP settings"
      description='Paste an "mcpServers" object from Claude Desktop, Claude Code, Cursor or a server README.'
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!json.trim()}
            onClick={async () => {
              const added = await attempt(() => invoke('connectors:importJson', json));
              if (added === undefined) return;
              toast.success(added ? `Added ${added} connector${added === 1 ? '' : 's'}` : 'Those connectors already exist');
              setJson('');
              onOpenChange(false);
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <Textarea rows={12} value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-[12px]" placeholder={'{\n  "mcpServers": {\n    "memory": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"] }\n  }\n}'} />
    </Dialog>
  );
}

const POLICY_OPTIONS: Array<{ value: ToolPolicy; label: string }> = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'off', label: 'Off' },
];

function ConnectorCard({ status, onEdit }: { status: ConnectorStatus; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { config } = status;
  const summary = config.transport === 'stdio' ? `${config.command} ${joinArgs(config.args)}`.trim() : config.url;
  const dot = status.state === 'connected' ? 'online' : status.state === 'connecting' ? 'loading' : status.state === 'error' ? 'warning' : 'offline';
  return (
    <Card testId="connector-row">
      <div className="flex items-start gap-3">
        <StatusDot state={dot} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">{config.name}</span>
            {config.pluginName && <Badge tone="outline">{config.pluginName}</Badge>}
            <span className="text-[12px] text-muted-foreground">
              {status.state === 'connected' ? `${status.tools.length} tool${status.tools.length === 1 ? '' : 's'}${status.serverName ? ` · ${status.serverName}${status.serverVersion ? ` ${status.serverVersion}` : ''}` : ''}` : status.state === 'connecting' ? 'Connecting…' : status.state === 'disabled' ? 'Off' : 'Not connected'}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground" title={summary}>
            {summary}
          </div>
          {status.state === 'error' && status.message && <pre className="mt-1.5 max-h-28 overflow-auto rounded-md bg-danger/10 px-2 py-1 font-mono text-[11.5px] whitespace-pre-wrap text-danger">{status.message}</pre>}
        </div>
        <Switch checked={config.enabled} onCheckedChange={(v) => void attempt(() => invoke('connectors:setEnabled', config.id, v))} label={`Use ${config.name}`} />
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Connector options" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
              <Ellipsis className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<RefreshCw />} onSelect={() => void attempt(() => invoke('connectors:reconnect', config.id))}>
              Reconnect
            </MenuItem>
            {!config.pluginName && (
              <>
                <MenuItem icon={<Pencil />} onSelect={onEdit}>
                  Edit
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash />} destructive onSelect={() => window.confirm(`Remove ${config.name}?`) && void attempt(() => invoke('connectors:delete', config.id), 'Connector removed')}>
                  Remove
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      {status.tools.length > 0 && (
        <div className="mt-2 border-t border-divider pt-2">
          <button onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} /> Tools and permissions
          </button>
          {expanded && (
            <div className="mt-2 divide-y divide-divider">
              {status.tools.map((tool) => (
                <div key={tool.name} className="flex items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px]">{tool.name}</span>
                      {tool.readOnly && <Badge>read-only</Badge>}
                    </div>
                    <div className="line-clamp-1 text-[12px] text-muted-foreground" title={tool.description}>
                      {tool.description}
                    </div>
                  </div>
                  <Select value={tool.policy} onChange={(policy) => void attempt(() => invoke('connectors:setToolPolicy', config.id, tool.name, policy))} options={POLICY_OPTIONS} className="h-7 min-w-24" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ConnectorsSection() {
  const { data: connectors = [], isLoading } = useConnectors();
  const { data: background } = useBackground();
  const [editing, setEditing] = useState<ConnectorStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  return (
    <>
      <Header
        title="Connectors"
        description="Connect models to apps and data through MCP servers. Tools marked read-only run without asking; others ask first, unless you allow them. Connectors work in Chat, Cowork and Code with tool-capable models."
        actions={
          <>
            {background?.claudeDesktopConfig && (
              <Button variant="outline" size="sm" onClick={() => void attempt(() => invoke('connectors:importClaude')).then((n) => n !== undefined && toast.success(n ? `Imported ${n} connector${n === 1 ? '' : 's'} from Claude Desktop` : 'No new connectors to import'))}>
                Import from Claude Desktop
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setJsonOpen(true)}>
              Paste JSON
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="add-connector"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-3.5" /> Add connector
            </Button>
          </>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : connectors.length === 0 ? (
        <EmptyState icon={<Plug className="size-5" />} title="No connectors yet" description="Add an MCP server, for example the filesystem, GitHub, memory or a database server, or import the ones you use in Claude Desktop." />
      ) : (
        <div className="space-y-2">
          {connectors.map((status) => (
            <ConnectorCard
              key={status.config.id}
              status={status}
              onEdit={() => {
                setEditing(status);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}
      <ConnectorDialog connector={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <ImportJsonDialog open={jsonOpen} onOpenChange={setJsonOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Plugins

function PluginsSection() {
  const { data: plugins = [], isLoading } = usePlugins();
  const [source, setSource] = useState('');
  const [installing, setInstalling] = useState(false);
  const install = async (from: string) => {
    setInstalling(true);
    const installed = await attempt(() => invoke('plugins:install', from));
    setInstalling(false);
    if (installed) {
      toast.success(`Installed ${installed.map((p) => p.name).join(', ')}`);
      setSource('');
    }
  };
  return (
    <>
      <Header title="Plugins" description="Plugins bundle skills, slash commands and connectors. Cellar reads the Claude Code plugin layout, so plugins and marketplaces made for Claude Code install here too." />
      <Card className="mb-4">
        <div className="text-[13.5px] font-medium">Install a plugin</div>
        <div className="mt-2 flex gap-2">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://github.com/owner/plugin.git" className="font-mono" data-testid="plugin-source" />
          <Button variant="primary" disabled={installing || !source.trim()} onClick={() => void install(source)}>
            {installing && <Spinner className="size-3.5" />} Install
          </Button>
          <Button
            variant="outline"
            disabled={installing}
            onClick={async () => {
              const path = await invoke('system:pickPath', 'plugin');
              if (path) void install(path);
            }}
          >
            From folder or .zip
          </Button>
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">Git URLs are cloned with git. A marketplace repository installs every plugin it lists.</p>
      </Card>
      {isLoading ? (
        <Spinner />
      ) : plugins.length === 0 ? (
        <EmptyState icon={<Puzzle className="size-5" />} title="No plugins installed" />
      ) : (
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <Card key={plugin.id} testId="plugin-row">
              <div className="flex items-start gap-3">
                <Puzzle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{plugin.name}</span>
                    {plugin.version && <Badge>v{plugin.version}</Badge>}
                    {plugin.author && <span className="text-[12px] text-muted-foreground">by {plugin.author}</span>}
                  </div>
                  {plugin.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{plugin.description}</p>}
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {[`${plugin.skills} skill${plugin.skills === 1 ? '' : 's'}`, `${plugin.commands} command${plugin.commands === 1 ? '' : 's'}`, `${plugin.connectors} connector${plugin.connectors === 1 ? '' : 's'}`].join(' · ')}
                  </div>
                  {plugin.error && <p className="mt-1 text-[12px] text-warning">{plugin.error}</p>}
                </div>
                <Switch checked={plugin.enabled} onCheckedChange={(v) => void attempt(() => invoke('plugins:setEnabled', plugin.id, v))} label={`Use ${plugin.name}`} />
                <Menu>
                  <MenuTrigger asChild>
                    <button aria-label="Plugin options" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
                      <Ellipsis className="size-4" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem icon={<FolderOpen />} onSelect={() => void invoke('plugins:reveal', plugin.id)}>
                      Open folder
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash />} destructive onSelect={() => window.confirm(`Remove ${plugin.name}?`) && void attempt(() => invoke('plugins:remove', plugin.id), 'Plugin removed')}>
                      Remove
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Commands

function CommandDialog({ command, open, onOpenChange }: { command: CommandInfo | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(command?.name ?? '');
    setDescription(command?.description ?? '');
    setBody('');
    if (command) void invoke('commands:get', command.name).then((detail) => setBody(detail.body));
  }, [open, command]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={command ? `Edit /${command.name}` : 'New command'}
      description="A slash command sends a saved prompt. $ARGUMENTS is replaced by what you type after the command."
      className="w-[min(640px,calc(100vw-40px))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !body.trim()}
            data-testid="save-command"
            onClick={async () => {
              const saved = await attempt(() => invoke('commands:save', { previousName: command?.name, name, description, body }), 'Command saved');
              if (saved) onOpenChange(false);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Name</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-muted-foreground">/</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="review" className="font-mono" data-testid="command-name" />
          </div>
        </label>
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Description</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Review text for clarity and tone" />
        </label>
        <label className="block">
          <span className="text-[12.5px] text-muted-foreground">Prompt</span>
          <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[12.5px]" placeholder={'Review the following for clarity, tone and mistakes. Suggest concrete edits.\n\n$ARGUMENTS'} data-testid="command-body" />
        </label>
      </div>
    </Dialog>
  );
}

function CommandsSection() {
  const { data: commands = [], isLoading } = useCommands('code');
  const [editing, setEditing] = useState<CommandInfo | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Header
        title="Commands"
        description="Type / in any composer to run a command. Your commands are Markdown files in ~/.cellar/commands, in the same format as Claude Code's."
        actions={
          <Button
            variant="primary"
            size="sm"
            data-testid="new-command"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-3.5" /> New command
          </Button>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="divide-y divide-divider rounded-xl border border-divider bg-card">
          {commands.map((command) => (
            <div key={command.name} className="flex items-center gap-3 px-4 py-2.5" data-testid="command-row">
              <span className="w-40 shrink-0 truncate font-mono text-[13px]">/{command.name}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{command.description}</span>
              <Badge tone={command.source === 'built-in' ? 'default' : 'outline'}>{command.source === 'built-in' ? 'Built-in' : command.pluginName ?? 'Yours'}</Badge>
              {command.source === 'user' ? (
                <span className="flex">
                  <button
                    aria-label={`Edit /${command.name}`}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
                    onClick={() => {
                      setEditing(command);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button aria-label={`Delete /${command.name}`} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-danger" onClick={() => void attempt(() => invoke('commands:delete', command.name), 'Command deleted')}>
                    <Trash className="size-3.5" />
                  </button>
                </span>
              ) : (
                <span className="w-14" />
              )}
            </div>
          ))}
        </div>
      )}
      <CommandDialog command={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Memory

function MemorySection() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const { data: memories = [], isLoading } = useMemories();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  if (!settings) return null;
  return (
    <>
      <Header title="Memory" description="Facts models keep in mind across conversations: your preferences, projects and context. Ask a tool-capable model to remember or forget something, type /remember, or add memories here. Incognito chats never use memory." />
      <Card className="mb-4">
        <Field label="Use memory" description="Include saved memories in chats, tasks and Code sessions, and let models save new ones when you ask.">
          <Switch checked={settings.memoryEnabled} onCheckedChange={(v) => update.mutate({ memoryEnabled: v })} />
        </Field>
        <Field label="Search past chats" description="Let tool-capable models look up earlier conversations when you refer to them.">
          <Switch checked={settings.searchPastChats} onCheckedChange={(v) => update.mutate({ searchPastChats: v })} />
        </Field>
      </Card>
      <div className="mb-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. I live in Istanbul and use metric units."
          data-testid="memory-input"
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && draft.trim()) {
              if (await attempt(() => invoke('memory:add', draft))) setDraft('');
            }
          }}
        />
        <Button variant="primary" disabled={!draft.trim()} onClick={async () => (await attempt(() => invoke('memory:add', draft))) && setDraft('')}>
          Add
        </Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : memories.length === 0 ? (
        <EmptyState icon={<Brain className="size-5" />} title="Nothing remembered yet" />
      ) : (
        <>
          <div className="divide-y divide-divider rounded-xl border border-divider bg-card">
            {memories.map((memory) => (
              <div key={memory.id} className="group flex items-start gap-3 px-4 py-2.5" data-testid="memory-row">
                <div className="min-w-0 flex-1">
                  {editingId === memory.id ? (
                    <Input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Escape') setEditingId(null);
                        if (e.key === 'Enter' && editText.trim()) {
                          await attempt(() => invoke('memory:update', memory.id, editText));
                          setEditingId(null);
                        }
                      }}
                    />
                  ) : (
                    <div className="text-[13.5px] text-foreground">{memory.content}</div>
                  )}
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {memory.source === 'model' ? 'Saved by a model' : 'Added by you'} · {relativeTime(memory.updatedAt)}
                  </div>
                </div>
                <button
                  aria-label="Edit memory"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-foreground"
                  onClick={() => {
                    setEditingId(memory.id);
                    setEditText(memory.content);
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button aria-label="Delete memory" className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-danger" onClick={() => void attempt(() => invoke('memory:delete', memory.id))}>
                  <Trash className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!window.confirm('Forget everything in memory?')) return;
                await attempt(() => invoke('memory:clear'));
                await qc.invalidateQueries({ queryKey: keys.memory });
              }}
            >
              Forget everything
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export function CustomizePage() {
  const { section } = useParams({ from: '/customize/$section' });
  const content: Record<string, ReactNode> = {
    skills: <SkillsSection />,
    connectors: <ConnectorsSection />,
    plugins: <PluginsSection />,
    commands: <CommandsSection />,
    memory: <MemorySection />,
  };
  return (
    <div className="flex h-full pt-9">
      <nav className="w-56 shrink-0 px-3 pt-6">
        <h1 className="mb-4 px-2 font-serif text-[26px]">Customize</h1>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            to="/customize/$section"
            params={{ section: s.id }}
            className={cn('flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-fg-2 hover:bg-hover hover:text-foreground', section === s.id && 'bg-selected text-foreground hover:bg-selected')}
          >
            <s.icon className="size-[15px]" strokeWidth={1.75} />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="max-w-[820px] px-8 pt-[60px] pb-16">{content[section] ?? content.skills}</div>
      </div>
    </div>
  );
}
