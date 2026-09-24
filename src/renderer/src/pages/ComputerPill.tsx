/**
 * The bar at the top of the screen while the model uses the computer (its own always-on-top window,
 * `#/computer`, hidden from screenshots). It says what the model is doing and holds the controls:
 * Stop, Resume after the user took the mouse, Done after a hand-over, Allow/Deny for a step that
 * asks while Cellar's window is out of the way.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hand, MousePointerClick, Pause, ShieldAlert } from 'lucide-react';
import type { ApprovalAction } from '@shared/types/agent';
import type { ComputerState } from '@shared/types/computer';
import { invoke, onEvent } from '@/lib/ipc';
import { cn } from '@/lib/utils';

function PillButton({ children, onClick, tone = 'plain', disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'plain' | 'primary' | 'danger'; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition disabled:opacity-50',
        tone === 'primary' && 'bg-[#d97757] text-white hover:bg-[#c96a4b]',
        tone === 'danger' && 'bg-white/10 text-[#ffb4a8] hover:bg-[#e5484d] hover:text-white',
        tone === 'plain' && 'bg-white/10 text-white hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

export function ComputerPill() {
  const [state, setState] = useState<ComputerState>({ phase: 'idle' });
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('computer-pill');
    void invoke('computer:state').then(setState).catch(() => undefined);
    return onEvent('computer:state', (next) => {
      setState(next);
      setBusy(false);
    });
  }, []);

  // The window is exactly as tall as the pill, so nothing around it swallows clicks.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => void invoke('computer:pillSize', Math.ceil(el.getBoundingClientRect().height) + 16).catch(() => undefined);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const decide = async (action: ApprovalAction) => {
    if (!state.messageId || !state.approval) return;
    setBusy(true);
    try {
      await invoke('tasks:approve', state.messageId, state.approval.toolCallId, { action });
    } catch {
      setBusy(false);
    }
  };
  const stop = () => void invoke('computer:stop');
  const resume = () => {
    setBusy(true);
    void invoke('computer:resume');
  };

  const stopLabel = state.stopShortcut ? `Stop (${state.stopShortcut})` : 'Stop';
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2 select-none">
      <div ref={root} className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1f1e1d]/95 text-white shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur" data-testid="computer-pill">
        {state.phase === 'approval' && state.approval ? (
          <div className="px-3.5 py-2.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#d97757]" />
              <div className="min-w-0">
                <div className="text-[13px] leading-snug font-medium">{state.approval.title}</div>
                {state.approval.detail && <div className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-white/65">{state.approval.detail}</div>}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <PillButton tone="primary" disabled={busy} onClick={() => void decide('allow')}>
                Allow
              </PillButton>
              {state.approval.canAllowAll && (
                <PillButton disabled={busy} onClick={() => void decide('allow-all')}>
                  Allow until done
                </PillButton>
              )}
              <PillButton disabled={busy} onClick={() => void decide('deny')}>
                Deny
              </PillButton>
              <span className="flex-1" />
              <PillButton tone="danger" onClick={stop}>
                {stopLabel}
              </PillButton>
            </div>
          </div>
        ) : state.phase === 'paused' || state.phase === 'handover' ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2">
            {state.phase === 'paused' ? <Pause className="size-4 shrink-0 text-[#d97757]" /> : <Hand className="size-4 shrink-0 text-[#d97757]" />}
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
              <span className="font-medium">{state.phase === 'paused' ? 'Paused. ' : 'Your turn: '}</span>
              <span className="text-white/80">{state.reason}</span>
            </div>
            <PillButton tone="primary" disabled={busy} onClick={resume}>
              {state.phase === 'paused' ? 'Resume' : 'Done'}
            </PillButton>
            <PillButton tone="danger" onClick={stop}>
              Stop
            </PillButton>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3.5 py-2">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#d97757] opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#d97757]" />
            </span>
            <MousePointerClick className="size-4 shrink-0 text-white/70" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">{state.action || 'Cellar is using your computer'}</div>
              <div className="truncate text-[11px] text-white/55">Move the mouse to pause</div>
            </div>
            <PillButton tone="danger" onClick={stop}>
              {stopLabel}
            </PillButton>
          </div>
        )}
      </div>
    </div>
  );
}
