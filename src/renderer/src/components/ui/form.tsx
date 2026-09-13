import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as RadixSelect, Slider as RadixSlider, Switch as RadixSwitch } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'no-drag h-8 w-full rounded-lg border border-composer-border bg-composer px-2.5 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand/60',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'no-drag w-full resize-y rounded-lg border border-composer-border bg-composer px-2.5 py-2 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-brand/60',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Switch({ checked, onCheckedChange, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="no-drag relative h-5 w-9 shrink-0 rounded-full bg-track transition-colors outline-none data-[disabled]:opacity-40 data-[state=checked]:bg-brand"
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}

export function Slider({ value, min, max, step = 1, onChange, disabled, className }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; className?: string }) {
  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => onChange(v[0])}
      className={cn('no-drag relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-40', className)}
    >
      <RadixSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-track">
        <RadixSlider.Range className="absolute h-full bg-brand" />
      </RadixSlider.Track>
      <RadixSlider.Thumb className="block size-3.5 rounded-full border-2 border-brand bg-background shadow outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
    </RadixSlider.Root>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: string;
}

export function Select<T extends string>({ value, onChange, options, className, disabled, placeholder }: { value: T; onChange: (v: T) => void; options: SelectOption<T>[]; className?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <RadixSelect.Trigger
        className={cn(
          'no-drag inline-flex h-8 min-w-28 items-center justify-between gap-2 rounded-lg border border-composer-border bg-composer px-2.5 text-[13px] text-foreground outline-none data-[disabled]:opacity-40',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-menu-border bg-menu p-1 text-[13px] shadow-xl">
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} className="relative flex cursor-default items-center rounded-lg py-1.5 pr-8 pl-2 outline-none select-none data-[highlighted]:bg-hover">
                <div>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  {o.description && <div className="text-[11.5px] text-muted-foreground">{o.description}</div>}
                </div>
                <RadixSelect.ItemIndicator className="absolute right-2">
                  <Check className="size-3.5" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; disabled?: boolean }>; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('no-drag inline-flex items-center rounded-lg bg-track p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md border border-transparent px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',
            size === 'md' ? 'h-[26px]' : 'h-6',
            value === o.value && 'border-track-border bg-track-active text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, description, children, className, stacked }: { label: ReactNode; description?: ReactNode; children: ReactNode; className?: string; stacked?: boolean }) {
  return (
    <div className={cn('flex gap-4 py-3', stacked ? 'flex-col gap-2' : 'items-center justify-between', className)}>
      <div className="min-w-0">
        <div className="text-[13.5px] text-foreground">{label}</div>
        {description && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      <div className={cn(stacked ? 'w-full' : 'shrink-0')}>{children}</div>
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, placeholder, className }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; placeholder?: string; className?: string }) {
  return (
    <Input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      placeholder={placeholder ?? 'Auto'}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(null);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={cn('w-28 text-right tabular-nums', className)}
    />
  );
}
