import { Check, ChevronDown, Hand, Map as MapIcon, MessageCircleQuestion, Zap } from 'lucide-react';
import type { CodeMode } from '@shared/types/code';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import type { Icon } from '@/lib/tasks';

export interface CodeModeValue {
  mode: CodeMode;
  autoAcceptEdits: boolean;
}

interface Option extends CodeModeValue {
  key: string;
  label: string;
  short: string;
  description: string;
  icon: Icon;
}

export const CODE_MODE_OPTIONS: Option[] = [
  { key: 'ask', mode: 'ask', autoAcceptEdits: false, label: 'Ask', short: 'Ask', description: 'Answer questions about the code. Nothing is changed.', icon: MessageCircleQuestion },
  { key: 'plan', mode: 'plan', autoAcceptEdits: false, label: 'Plan', short: 'Plan', description: 'Explore and propose a plan before any change.', icon: MapIcon },
  { key: 'code', mode: 'code', autoAcceptEdits: false, label: 'Code, ask before edits', short: 'Code', description: 'Edit files and run commands after you approve each one.', icon: Hand },
  { key: 'code-auto', mode: 'code', autoAcceptEdits: true, label: 'Code, auto-accept edits', short: 'Auto-accept edits', description: 'Edits apply right away. Commands still ask.', icon: Zap },
];

export const codeModeKey = (value: CodeModeValue) => (value.mode === 'code' ? (value.autoAcceptEdits ? 'code-auto' : 'code') : value.mode);

/** The next mode for Shift+Tab. */
export function nextCodeMode(value: CodeModeValue): CodeModeValue {
  const i = CODE_MODE_OPTIONS.findIndex((o) => o.key === codeModeKey(value));
  const next = CODE_MODE_OPTIONS[(i + 1) % CODE_MODE_OPTIONS.length];
  return { mode: next.mode, autoAcceptEdits: next.autoAcceptEdits };
}

export function CodeModeMenu({ value, onChange }: { value: CodeModeValue; onChange: (value: CodeModeValue) => void }) {
  const current = CODE_MODE_OPTIONS.find((o) => o.key === codeModeKey(value)) ?? CODE_MODE_OPTIONS[2];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button data-testid="code-mode" data-mode={current.key} title="Mode (Shift+Tab)" className="no-drag flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-fg-2 hover:bg-hover hover:text-foreground">
          <current.icon className="size-3.5" strokeWidth={1.9} />
          <span className="max-w-36 truncate">{current.short}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-72">
        {CODE_MODE_OPTIONS.map((option) => (
          <MenuItem key={option.key} data-testid={`code-mode-${option.key}`} className="h-auto items-start py-2" onSelect={() => onChange({ mode: option.mode, autoAcceptEdits: option.autoAcceptEdits })}>
            <div className="flex items-start gap-2.5">
              <option.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 whitespace-normal">
                <div className="text-[13.5px] text-foreground">{option.label}</div>
                <div className="text-[12px] leading-snug text-muted-foreground">{option.description}</div>
              </div>
              <span className="flex size-4 shrink-0 items-center justify-center">{option.key === current.key && <Check className="size-4" />}</span>
            </div>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
