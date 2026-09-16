import { useMemo } from 'react';
import { renderMath } from '@shared/math/mathtext';
import { MATH_CSS } from '@shared/math/render';
import { cn } from '@/lib/utils';

/** The shared maths styles, injected once per board so the editor and exports match. */
export function MathStyles() {
  return <style>{MATH_CSS}</style>;
}

/**
 * Maths written as text, typeset. The HTML comes from Cellar's own renderer, which escapes every
 * piece of text it is given, so board content can never inject markup.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMath(text), [text]);
  return <span className={cn('m-math', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** An SVG figure or graph built by the shared renderer. */
export function SvgFigure({ svg, className }: { svg: string; className?: string }) {
  return <span className={cn('block [&>svg]:max-w-full', className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}
