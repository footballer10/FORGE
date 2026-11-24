import type { ReactNode } from 'react';

interface Props {
  title: string;
  body: string;
  children?: ReactNode;
}

/** Placeholder content for a screen that has no data or is not built yet. */
export function EmptyState({ title, body, children }: Props) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface p-5">
      <h2 className="text-2xl uppercase">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      {children}
    </div>
  );
}
