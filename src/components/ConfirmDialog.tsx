import { useEffect } from 'react';

interface Props {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (outline, not the accent colour). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for window.confirm. Cancel is the first button and the safe default. */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end bg-black/60 pb-safe" onClick={onCancel}>
      <div className="mx-auto w-full max-w-md rounded-t-card border border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl uppercase">{title}</h2>
        {body && <p className="mt-1 text-sm text-muted">{body}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" autoFocus onClick={onCancel} className="min-h-tap flex-1 rounded-card border border-line px-3 text-fg">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-tap flex-1 rounded-card px-3 font-semibold ${destructive ? 'border border-line text-fg' : 'bg-accent text-white'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
