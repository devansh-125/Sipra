import { mapLegendItems } from '../../utils/mapLegend.ts';

type LegendItem = {
  label: string;
  color: string;
};

function legendDotClasses(color: string): string {
  if (color.startsWith('gray')) {
    return 'bg-slate-400 border border-slate-300';
  }
  if (color === 'green') {
    return 'bg-emerald-400';
  }
  if (color === 'yellow') {
    return 'bg-amber-400';
  }
  if (color === 'red') {
    return 'bg-rose-400';
  }
  return 'bg-sky-400';
}

export default function MapLegend() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      {mapLegendItems.map((item) => {
        const legend = item as LegendItem;
        return (
          <div key={legend.label} className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${legendDotClasses(legend.color)}`} />
            <span>{legend.label}</span>
          </div>
        );
      })}
    </div>
  );
}
