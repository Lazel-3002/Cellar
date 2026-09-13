import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tip } from './misc';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'brand';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: 'bg-foreground text-background hover:opacity-90',
  secondary: 'bg-selected text-foreground hover:bg-track-active',
  ghost: 'text-fg-2 hover:bg-hover hover:text-foreground',
  outline: 'border border-composer-border text-foreground hover:bg-hover',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  brand: 'bg-brand text-white hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13.5px] gap-2 rounded-lg',
  lg: 'h-10 px-4 text-[14px] gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', size = 'md', className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'no-drag inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45',
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, active, size = 'md', tooltipSide = 'bottom', className, children, ...props }, ref) => (
    <Tip label={label} side={tooltipSide}>
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'no-drag inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
          size === 'md' ? 'size-7' : 'size-6',
          active && 'bg-selected text-foreground hover:bg-selected',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tip>
  ),
);
IconButton.displayName = 'IconButton';
