import type { ComponentProps, ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu, Popover } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

const panel = 'z-50 min-w-48 overflow-hidden rounded-xl border border-menu-border bg-menu p-1 text-[13.5px] text-foreground shadow-xl shadow-black/30 animate-fade-in';

export function MenuContent({ className, align = 'start', sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(panel, 'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto', className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, icon, shortcut, destructive, children, ...props }: ComponentProps<typeof DropdownMenu.Item> & { icon?: ReactNode; shortcut?: string; destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover',
        destructive && 'text-danger',
        className,
      )}
      {...props}
    >
      {icon && <span className="flex size-4 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[11.5px] text-muted-foreground">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuCheckItem({ checked, children, ...props }: ComponentProps<typeof DropdownMenu.Item> & { checked: boolean }) {
  return (
    <DropdownMenu.Item className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 outline-none select-none data-[highlighted]:bg-hover" {...props}>
      <span className="flex size-4 items-center justify-center">{checked && <Check className="size-4" />}</span>
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-menu-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-[11.5px] font-medium text-muted-foreground">{children}</DropdownMenu.Label>;
}

export function MenuSub({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 outline-none select-none data-[highlighted]:bg-hover data-[state=open]:bg-hover">
        {icon && <span className="flex size-4 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <span className="flex-1">{label}</span>
        <ChevronRight className="size-3.5 text-muted-foreground" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} className={panel}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

export const PopoverRoot = Popover.Root;
export const PopoverTrigger = Popover.Trigger;
export const PopoverAnchor = Popover.Anchor;
export const PopoverClose = Popover.Close;

export function PopoverContent({ className, align = 'start', sideOffset = 8, ...props }: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content align={align} sideOffset={sideOffset} className={cn('z-50 rounded-xl border border-menu-border bg-menu text-foreground shadow-xl shadow-black/30 outline-none animate-fade-in', className)} {...props} />
    </Popover.Portal>
  );
}
