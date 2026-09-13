import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Code, Coffee, FolderClosed, FolderOpen, FolderPlus, Ghost, GraduationCap, Lightbulb, PenLine, Sparkles, TriangleAlert, X } from 'lucide-react';
import { coworkGuidance } from '@shared/model-guidance';
import { CellarMark } from '@/components/brand/Logo';
import { Composer } from '@/components/composer/Composer';
import { Button } from '@/components/ui/button';
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuTrigger } from '@/components/ui/menu';
import { isChatCapable, useSelectedModel } from '@/lib/hooks';
import { invoke } from '@/lib/ipc';
import { useProjects, useProviders, useSettings } from '@/lib/queries';
import { conversationRoute, IDEAS } from '@/lib/tasks';
import { cn, greetingFor } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const SUGGESTIONS: Array<{ label: string; icon: typeof PenLine; prompts: string[] }> = [
  { label: 'Write', icon: PenLine, prompts: ['Help me write a friendly follow-up email after a job interview', 'Draft a short story opening set in a wine cellar', 'Rewrite this paragraph to be clearer: '] },
  { label: 'Learn', icon: GraduationCap, prompts: ['Explain how quantization (Q4_K_M vs Q8_0) affects a language model', 'Teach me the basics of linear algebra with examples', 'What happened during the fall of the Western Roman Empire?'] },
  { label: 'Code', icon: Code, prompts: ['Write a Python script that renames photos by the date they were taken', 'Explain this error and how to fix it: ', 'Build a small HTML page with a Pomodoro timer'] },
  { label: 'Life stuff', icon: Coffee, prompts: ['Plan a week of simple high-protein dinners', 'Help me build a realistic morning routine', 'Suggest a weekend trip itinerary near me: '] },
  { label: "Cellar's choice", icon: Lightbulb, prompts: ['Surprise me with a fascinating fact and explain why it is true', 'Give me a creative writing prompt and start the first paragraph', 'Quiz me on world geography, one question at a time'] },
];

function ChatSuggestions() {
  const [open, setOpen] = useState<string | null>(null);
  const setPendingPrompt = useUi((s) => s.setPendingPrompt);
  const active = SUGGESTIONS.find((s) => s.label === open);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => setOpen(open === label ? null : label)}
            className={cn(
              'no-drag flex h-8 items-center gap-2 rounded-lg border border-composer-border px-3 text-[13.5px] text-fg-2 transition-colors hover:bg-hover hover:text-foreground',
              open === label && 'bg-hover text-foreground',
            )}
          >
            <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>
      {active && (
        <div className="mx-auto mt-3 max-w-[640px] overflow-hidden rounded-xl border border-composer-border bg-composer animate-fade-in">
          {active.prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setPendingPrompt(prompt);
                setOpen(null);
              }}
              className="block w-full border-b border-divider px-4 py-2.5 text-left text-[14px] text-fg-2 last:border-0 hover:bg-hover hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

function Chip({ icon, label, title, onClear }: { icon: React.ReactNode; label: string; title?: string; onClear: () => void }) {
  return (
    <span title={title} className="no-drag flex h-7 max-w-[260px] items-center gap-1.5 rounded-lg border border-composer-border bg-composer pr-1 pl-2 text-[13px] text-foreground">
      <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="truncate">{label}</span>
      <button aria-label={`Remove ${label}`} onClick={onClear} className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}

function CoworkExtras() {
  const { coworkFolder, coworkSkipped, coworkProjectId, setCoworkFolder, setCoworkSkipped, setCoworkProject, setPendingPrompt } = useUi();
  const { data: settings } = useSettings();
  const { data: projects = [] } = useProjects();
  const { model } = useSelectedModel();
  const project = projects.find((p) => p.id === coworkProjectId);
  const guidance = model ? coworkGuidance(model) : null;

  const chooseFolder = async (): Promise<string | null> => {
    const dir = await invoke('system:pickDirectory', 'Choose a folder for Cellar to work in');
    if (dir) setCoworkFolder(dir);
    return dir;
  };

  return (
    <div className="mt-3 px-4">
      <div className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
        {coworkFolder ? (
          <Chip icon={<FolderOpen />} label={folderName(coworkFolder)} title={coworkFolder} onClear={() => setCoworkFolder(null)} />
        ) : coworkSkipped ? (
          <Chip icon={<FolderPlus />} label="New folder for this task" title="Cellar creates an empty folder for the files this task makes" onClear={() => setCoworkSkipped(false)} />
        ) : (
          <>
            <Menu>
              <MenuTrigger asChild>
                <button data-testid="cowork-folder" className="no-drag flex items-center gap-1 text-fg-2 hover:text-foreground">
                  Project or folder <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              </MenuTrigger>
              <MenuContent align="start" className="w-72">
                <MenuItem icon={<FolderOpen />} onSelect={() => void chooseFolder()}>
                  Choose a folder…
                </MenuItem>
                {(settings?.recentFolders.length ?? 0) > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuLabel>Recent folders</MenuLabel>
                    {settings!.recentFolders.map((dir) => (
                      <MenuItem key={dir} icon={<FolderClosed />} onSelect={() => setCoworkFolder(dir)} title={dir}>
                        {folderName(dir)}
                      </MenuItem>
                    ))}
                  </>
                )}
                <MenuSeparator />
                <MenuSub label="Use a project's instructions" icon={<Sparkles />}>
                  {projects.length === 0 && <MenuLabel>No projects yet</MenuLabel>}
                  {projects.map((p) => (
                    <MenuCheckItem key={p.id} checked={p.id === coworkProjectId} onSelect={() => setCoworkProject(p.id === coworkProjectId ? null : p.id)}>
                      {p.name}
                    </MenuCheckItem>
                  ))}
                </MenuSub>
              </MenuContent>
            </Menu>
            <button onClick={() => setCoworkSkipped(true)} className="no-drag text-fg-2 hover:text-foreground">
              Skip
            </button>
          </>
        )}
        {project && <Chip icon={<Sparkles />} label={project.name} title="Project instructions and knowledge are shared with the task" onClear={() => setCoworkProject(null)} />}
      </div>

      {guidance && guidance.level !== 'good' && (
        <div className={cn('mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed', guidance.level === 'poor' ? 'text-warning' : 'text-muted-foreground')}>
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{guidance.notes.join(' ')}</span>
        </div>
      )}

      <div className="mt-[38px] text-[12.5px] text-muted-foreground">Ideas for you</div>
      <div className="mt-2">
        {IDEAS.map((idea) => (
          <button
            key={idea.label}
            onClick={async () => {
              if (idea.needsFolder && !coworkFolder && !(await chooseFolder())) return;
              if (!idea.needsFolder && !coworkFolder) setCoworkSkipped(true);
              setPendingPrompt(idea.prompt);
            }}
            className="group flex h-12 w-full items-center gap-4 rounded-lg text-left"
          >
            <span className="flex size-[26px] items-center justify-center rounded-md border border-tile text-muted-foreground group-hover:text-foreground">
              <idea.icon className="size-4" strokeWidth={1.5} />
            </span>
            <span className="text-[15px] font-medium text-foreground">{idea.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SetupCard() {
  const navigate = useNavigate();
  const { data: providers = [] } = useProviders();
  const llama = providers.find((p) => p.kind === 'llamacpp');
  const others = providers.filter((p) => p.kind !== 'llamacpp' && p.state === 'online');
  return (
    <div className="mt-6 rounded-2xl border border-composer-border bg-card p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Let's get a model running</div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            Download a GGUF from Hugging Face to run on Cellar's built-in llama.cpp engine, or connect Ollama, LM Studio or Unsloth Studio.
            {llama?.state === 'not-installed' && ' You will also need a llama.cpp runtime — Cellar can download the right build for your GPU.'}
            {others.length > 0 && ` ${others.map((o) => o.name).join(', ')} ${others.length === 1 ? 'is' : 'are'} running but has no chat models yet.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void navigate({ to: '/discover', search: {} })}>
              Discover models
            </Button>
            {llama?.state === 'not-installed' && (
              <Button variant="outline" onClick={() => void navigate({ to: '/settings/$section', params: { section: 'engines' } })}>
                Install llama.cpp
              </Button>
            )}
            <Button variant="ghost" onClick={() => void navigate({ to: '/settings/$section', params: { section: 'connections' } })}>
              Connections
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { mode, incognito } = useUi();
  const { models, isLoading } = useSelectedModel();
  const greeting = useMemo(() => greetingFor(settings?.userName ?? ''), [settings?.userName]);
  const noModels = !isLoading && models.filter(isChatCapable).length === 0;

  return (
    <div className="h-full overflow-y-auto px-6 pt-9">
      <div className="mx-auto w-full max-w-[640px] pt-[calc(31vh-36px)] pb-16">
        {incognito ? (
          <div className="mb-8 flex flex-col items-center text-center animate-fade-in">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full border border-dashed border-composer-border text-fg-2">
              <Ghost className="size-6" strokeWidth={1.5} />
            </span>
            <h1 className="font-serif text-[34px] leading-tight text-foreground">Incognito chat</h1>
            <p className="mt-2 max-w-md text-[13.5px] text-muted-foreground">This chat won't be saved to your history or search, and it disappears when you leave it.</p>
          </div>
        ) : (
          <h1 className="mb-[34px] flex items-center justify-center gap-3 text-center font-serif text-[40px] leading-none tracking-[-0.01em] text-foreground">
            <CellarMark className="size-[34px]" />
            <span>{greeting}</span>
          </h1>
        )}
        <Composer variant="home" incognito={incognito} autoFocus onSent={(r, kind) => void navigate({ to: conversationRoute(kind), params: { conversationId: r.conversationId } })} />
        {!incognito && (mode === 'cowork' ? <CoworkExtras /> : <ChatSuggestions />)}
        {noModels && <SetupCard />}
      </div>
    </div>
  );
}
