import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, FolderClosed, MessageSquare, Plus, Search, Star, Trash, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Composer } from '@/components/composer/Composer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { invoke } from '@/lib/ipc';
import { keys, useProject, useProjects } from '@/lib/queries';
import { cn, formatBytes, relativeTime } from '@/lib/utils';

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = async () => {
    try {
      const project = await invoke('projects:create', { name, description });
      onOpenChange(false);
      setName('');
      setDescription('');
      void navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a project"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void create()}>
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] text-fg-2">What are you working on?</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your project" onKeyDown={(e) => e.key === 'Enter' && name.trim() && void create()} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] text-fg-2">What are you trying to achieve?</span>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your project, goals, subject, etc." />
        </label>
      </div>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const filtered = useMemo(() => projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);

  return (
    <div className="h-full overflow-y-auto pt-9">
      <div className="mx-auto max-w-[960px] px-8 pt-8 pb-16">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-[30px]">Projects</h1>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New project
          </Button>
        </div>
        <div className="relative mt-5">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…" className="h-10 pl-9" />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderClosed className="size-5" />}
            title={projects.length ? 'No matching projects' : 'Organize chats with projects'}
            description="Projects keep related chats together with shared instructions and knowledge files that every model in the project can use."
            action={
              <Button variant="outline" onClick={() => setCreating(true)}>
                Create a project
              </Button>
            }
          />
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {filtered.map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="group rounded-xl border border-divider bg-card p-4 transition-colors hover:border-composer-border hover:bg-hover/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate text-[15px] font-medium text-foreground">{p.name}</div>
                  {p.starred && <Star className="size-3.5 shrink-0 fill-current text-muted-foreground" />}
                </div>
                <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] text-muted-foreground">{p.description || 'No description'}</p>
                <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3.5" /> {p.conversationCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5" /> {p.fileCount}
                  </span>
                  <span className="ml-auto">Updated {relativeTime(p.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useProject(projectId);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [uploading, setUploading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !data) return <EmptyState className="h-full" title="Project not found" />;
  const { project, files, conversations } = data;
  const totalTokens = files.reduce((s, f) => s + f.tokens, 0);

  const addFiles = async (paths: string[]) => {
    if (!paths.length) return;
    setUploading(true);
    try {
      await invoke('projects:addFiles', project.id, paths);
      await qc.invalidateQueries({ queryKey: keys.project(project.id) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full pt-9">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 pt-6 pb-16">
          <Link to="/projects" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All projects
          </Link>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[30px] leading-tight">{project.name}</h1>
              {project.description && <p className="mt-1 text-[14px] text-muted-foreground">{project.description}</p>}
            </div>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  •••
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Star />} onSelect={() => void invoke('projects:update', project.id, { starred: !project.starred })}>
                  {project.starred ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuItem
                  icon={<Trash />}
                  destructive
                  onSelect={async () => {
                    if (!window.confirm(`Delete "${project.name}"? Its chats are kept but leave the project.`)) return;
                    await invoke('projects:delete', project.id);
                    void navigate({ to: '/projects' });
                  }}
                >
                  Delete project
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
          <div className="mt-6">
            <Composer variant="chat" projectId={project.id} placeholder={`Start a chat in ${project.name}…`} onSent={(r) => void navigate({ to: '/chat/$conversationId', params: { conversationId: r.conversationId } })} />
          </div>
          <div className="mt-8">
            {conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-divider px-4 py-8 text-center text-[13.5px] text-muted-foreground">Start a chat to keep conversations organized and reuse project knowledge.</div>
            ) : (
              <div className="divide-y divide-divider border-y border-divider">
                {conversations.map((c) => (
                  <Link key={c.id} to="/chat/$conversationId" params={{ conversationId: c.id }} className="flex items-center gap-3 px-2 py-3 hover:bg-hover/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px]">{c.title || 'Untitled'}</div>
                      <div className="text-[12px] text-muted-foreground">Last message {relativeTime(c.updatedAt)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-divider px-5 pt-6 pb-10">
        <section className="rounded-xl border border-divider bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-medium">Instructions</h2>
            {!editingInstructions && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInstructions(project.instructions);
                  setEditingInstructions(true);
                }}
              >
                {project.instructions ? 'Edit' : 'Add'}
              </Button>
            )}
          </div>
          {editingInstructions ? (
            <div className="mt-2">
              <Textarea rows={8} autoFocus value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="How should models behave in this project? Tone, format, context…" />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingInstructions(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await invoke('projects:update', project.id, { instructions });
                    setEditingInstructions(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className={cn('mt-1.5 line-clamp-6 text-[13px] whitespace-pre-wrap', project.instructions ? 'text-fg-2' : 'text-muted-foreground')}>{project.instructions || 'Add instructions to tailor responses in this project.'}</p>
          )}
        </section>
        <section className="mt-4 rounded-xl border border-divider bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-medium">Files</h2>
            <Button size="sm" variant="ghost" disabled={uploading} onClick={() => void invoke('system:pickFiles', 'knowledge').then(addFiles)}>
              {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />} Add
            </Button>
          </div>
          {files.length > 0 && <div className="mt-1 text-[12px] text-muted-foreground">~{totalTokens.toLocaleString('en-US')} tokens · included in full when they fit the context, otherwise the most relevant excerpts are used</div>}
          <div className="mt-2 space-y-1.5">
            {files.length === 0 && <p className="text-[13px] text-muted-foreground">Add PDFs, documents or code for models to reference.</p>}
            {files.map((f) => (
              <div key={f.id} className="group flex items-center gap-2.5 rounded-lg border border-divider bg-background px-2.5 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{f.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatBytes(f.size)} · ~{f.tokens.toLocaleString('en-US')} tokens
                  </div>
                </div>
                <button aria-label={`Remove ${f.name}`} className="opacity-0 group-hover:opacity-100" onClick={() => void invoke('projects:removeFile', f.id)}>
                  <Trash className="size-3.5 text-muted-foreground hover:text-danger" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
