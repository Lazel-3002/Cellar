import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Tip({ label, side = 'bottom', children, disabled }: { label: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode; disabled?: boolean }) {
  if (disabled) return <>{children}</>;
  return (
    <Tooltip.Root delayDuration={450}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-menu-border bg-menu px-2 py-1 text-[12px] text-foreground shadow-lg animate-fade-in"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-4 animate-spin text-muted-foreground', className)} />;
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'outline'; className?: string }) {
  const tones = {
    default: 'bg-selected text-fg-2',
    brand: 'bg-brand/15 text-brand',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    outline: 'border border-composer-border text-muted-foreground',
  };
  return <span className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Progress({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'muted' }) {
  const tones = { brand: 'bg-brand', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', muted: 'bg-muted-foreground' };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-track', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-composer-border bg-muted px-1.5 py-px font-sans text-[11px] text-muted-foreground">{children}</kbd>;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      {icon && <div className="flex size-11 items-center justify-center rounded-xl bg-selected text-fg-2">{icon}</div>}
      <div className="text-[15px] font-medium text-foreground">{title}</div>
      {description && <div className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</div>}
      {action}
    </div>
  );
}

export function StatusDot({ state, className }: { state: 'online' | 'offline' | 'warning' | 'loading'; className?: string }) {
  const color = { online: 'bg-success', offline: 'bg-faint', warning: 'bg-warning', loading: 'bg-brand animate-pulse' }[state];
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', color, className)} />;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <h2 className="text-[13px] font-medium text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}
