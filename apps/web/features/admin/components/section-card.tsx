import type { ReactNode } from 'react';

/** Titled surface used to group a panel's content. Mirrors `.surface-card`. */
export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="surface-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-white/55">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}
