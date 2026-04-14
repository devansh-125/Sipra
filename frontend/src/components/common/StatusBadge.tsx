import type { StatusTone } from '../../utils/statusColors.ts';

type StatusBadgeProps = {
  text: string;
  tone: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  yellow: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  gray: 'bg-slate-600/20 text-slate-300 border-slate-500/30'
};

export default function StatusBadge({ text, tone }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {text}
    </span>
  );
}
