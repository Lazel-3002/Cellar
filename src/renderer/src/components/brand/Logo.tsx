import { cn } from '@/lib/utils';

/** Cellar's mark: a vaulted cellar arch with a doorway — deliberately not Claude's asterisk. */
export function CellarMark({ className, strokeWidth = 2.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('text-brand', className)} aria-hidden="true">
      <path d="M4.5 27.5V15.5C4.5 9.15 9.65 4 16 4s11.5 5.15 11.5 11.5v12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M10.5 27.5v-10a5.5 5.5 0 0 1 11 0v10" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M16 12v15.5" stroke="currentColor" strokeWidth={strokeWidth * 0.75} strokeLinecap="round" />
      <path d="M2.5 27.5h27" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
