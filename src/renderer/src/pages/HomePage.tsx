import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Code, Coffee, FileText, FolderOpen, Ghost, GraduationCap, Lightbulb, Newspaper, PenLine, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { CellarMark } from '@/components/brand/Logo';
import { Composer } from '@/components/composer/Composer';
import { Button } from '@/components/ui/button';
import { isChatCapable, useSelectedModel } from '@/lib/hooks';
import { useProviders, useSettings } from '@/lib/queries';
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

function CoworkExtras() {
  const soon = () => toast('Cowork arrives in Milestone 2', { description: 'Local agents that read and write files in a folder you choose.' });
  const ideas = [
    { icon: Newspaper, label: 'Summarize a folder of documents' },
    { icon: FolderOpen, label: 'Organize my downloads folder' },
    { icon: FileText, label: 'Draft a weekly report from my notes' },
  ];
  return (
    <div className="mt-3 px-4">
      <div className="flex items-center gap-4 text-[14px]">
        <button onClick={soon} className="text-fg-2 hover:text-foreground">
          Project or folder
        </button>
        <button onClick={soon} className="text-fg-2 hover:text-foreground">
          Skip
        </button>
      </div>
      <div className="mt-[38px] text-[12.5px] text-muted-foreground">Ideas for you</div>
      <div className="mt-2">
        {ideas.map(({ icon: Icon, label }) => (
          <button key={label} onClick={soon} className="flex h-12 w-full items-center gap-4 rounded-lg text-left">
            <span className="flex size-[26px] items-center justify-center rounded-md border border-tile text-muted-foreground">
              <Icon className="size-4" strokeWidth={1.5} />
            </span>
            <span className="text-[15px] font-medium text-foreground">{label}</span>
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
        <Composer variant="home" incognito={incognito} autoFocus onSent={(r) => void navigate({ to: '/chat/$conversationId', params: { conversationId: r.conversationId } })} />
        {!incognito && (mode === 'cowork' ? <CoworkExtras /> : <ChatSuggestions />)}
        {noModels && <SetupCard />}
      </div>
    </div>
  );
}
