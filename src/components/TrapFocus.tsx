import { useRef, type HTMLAttributes } from 'react';
import { useFocusTrap } from './useFocusTrap';

/** A div that keeps keyboard focus inside while mounted: use for modal dialogs. */
export function TrapFocus(props: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return <div ref={ref} {...props} />;
}
