import type { PropsWithChildren } from 'react';

type SectionCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export default function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-base md:text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs md:text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
