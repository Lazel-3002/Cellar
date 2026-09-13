import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  side?: 'center' | 'right';
}

export function Dialog({ open, onOpenChange, title, description, children, footer, className, side = 'center' }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed z-50 flex flex-col border border-menu-border bg-background text-foreground shadow-2xl outline-none',
            side === 'center'
              ? 'top-1/2 left-1/2 max-h-[85vh] w-[min(520px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl animate-fade-in'
              : 'top-0 right-0 bottom-0 w-[min(500px,100vw)] border-y-0 border-r-0',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[16px] font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[13px] text-muted-foreground">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="no-drag -mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
