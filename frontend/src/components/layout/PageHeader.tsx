import type { ReactNode } from 'react';

type HeaderTone = 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';

type PageHeaderProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  badges?: string[];
  rightSlot?: ReactNode;
  tone?: HeaderTone;
};

function toneClasses(tone: HeaderTone) {
  if (tone === 'emerald') {
    return 'from-emerald-200 via-emerald-100 to-slate-100';
  }

  if (tone === 'amber') {
    return 'from-amber-200 via-amber-100 to-slate-100';
  }

  if (tone === 'rose') {
    return 'from-rose-200 via-rose-100 to-slate-100';
  }

  if (tone === 'slate') {
    return 'from-slate-200 via-slate-100 to-slate-50';
  }

  return 'from-cyan-200 via-sky-100 to-slate-100';
}

export default function PageHeader({
  title,
  subtitle,
  eyebrow = 'Operations View',
  badges = [],
  rightSlot,
  tone = 'cyan'
}: PageHeaderProps) {
  return (
    <header className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/75">{eyebrow}</p>
          <h1 className={`bg-gradient-to-r ${toneClasses(tone)} bg-clip-text text-2xl md:text-3xl font-bold tracking-tight text-transparent`}>
            {title}
          </h1>
          <p className="text-slate-300 text-sm md:text-base max-w-3xl">{subtitle}</p>

          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
