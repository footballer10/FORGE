import type { ReactNode } from 'react';

/** Frame for a screen one level down: Back link, big title, content. */
export function SubScreen({ title, onBack, backLabel = 'Back', children }: { title: string; onBack: () => void; backLabel?: string; children: ReactNode }) {
  return (
    <div className="pb-6">
      <button type="button" onClick={onBack} className="min-h-tap pt-4 text-sm text-muted">← {backLabel}</button>
      <h1 className="pb-4 text-4xl uppercase">{title}</h1>
      {children}
    </div>
  );
}

/** One tappable row in a menu list (Strong/Hevy style): title, short detail, chevron. */
export function MenuRow({ title, detail, onClick }: { title: string; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left">
      <span>
        <span className="block text-base font-medium">{title}</span>
        {detail && <span className="block text-sm text-muted">{detail}</span>}
      </span>
      <span aria-hidden="true" className="text-muted">›</span>
    </button>
  );
}
