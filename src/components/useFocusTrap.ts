import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Next index when Tab (or Shift+Tab) is pressed among `count` focusable items; wraps at both ends. */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

/**
 * Keeps keyboard focus inside a modal dialog: focuses the first control when it opens (unless something inside
 * already has focus), wraps Tab and Shift+Tab, and returns focus to the previous element on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!root.contains(document.activeElement)) (items()[0] ?? root).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) return e.preventDefault();
      const i = nextFocusIndex(list.indexOf(document.activeElement as HTMLElement), list.length, e.shiftKey);
      e.preventDefault();
      list[i]!.focus();
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [ref]);
}
