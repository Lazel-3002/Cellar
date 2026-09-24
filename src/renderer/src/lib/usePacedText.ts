import { useEffect, useRef, useState } from 'react';

/** Where the next word ends: past any leading whitespace, then up to the next whitespace. */
function nextWordEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  while (i < text.length && !/\s/.test(text[i])) i++;
  return i;
}

/**
 * Lets streamed text out one word at a time at `wordsPerSecond`, however fast the model
 * sends it, and keeps going after the stream ends until the reply is fully shown.
 * If the backlog grows past ~4s of words it speeds up so it never falls hopelessly behind.
 * Text already complete when mounted (history) shows at once; a falsy pace turns it off.
 */
export function usePacedText(target: string, streaming: boolean, wordsPerSecond: number | null | undefined): { text: string; revealing: boolean } {
  const on = !!wordsPerSecond;
  const [shown, setShown] = useState(() => (on && streaming ? 0 : target.length));
  const shownRef = useRef(shown);
  const targetRef = useRef(target);
  targetRef.current = target;

  // Replaced rather than extended (regenerate, edit): start over.
  if (on && shownRef.current > target.length) shownRef.current = 0;

  const behind = on && shownRef.current < target.length;

  useEffect(() => {
    if (!behind || !wordsPerSecond) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const text = targetRef.current;
      carry += ((now - last) / 1000) * wordsPerSecond;
      last = now;
      // Words still waiting, roughly; past ~4s worth, go faster in proportion.
      const waiting = text.slice(shownRef.current).split(/\s+/).length;
      const boost = Math.max(1, waiting / (wordsPerSecond * 4));
      let steps = Math.floor(carry * boost);
      if (steps > 0) {
        carry = 0;
        let i = shownRef.current;
        while (steps-- > 0 && i < text.length) i = nextWordEnd(text, i);
        shownRef.current = i;
        setShown(i);
      }
      if (shownRef.current < targetRef.current.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [behind, wordsPerSecond, target]);

  if (!on) return { text: target, revealing: false };
  return { text: target.slice(0, shownRef.current), revealing: behind };
}
