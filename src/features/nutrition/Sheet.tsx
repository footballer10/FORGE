import { useEffect, type ReactNode } from 'react';
import { TrapFocus } from '../../components/TrapFocus';

/** Full-screen dialog used by the food screens. Escape closes it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 overflow-y-auto bg-bg px-4 pb-safe pt-safe">
      <TrapFocus>
        <div className="mx-auto max-w-xl pb-8">{children}</div>
      </TrapFocus>
    </div>
  );
}

export const fieldClass = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
