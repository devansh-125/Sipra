import { mapLegendItems } from '../../utils/mapLegend.ts';

export default function MapLegend() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      {mapLegendItems.map((item) => {
        return (
          <div key={item.key} className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.dotClass}`} title={item.color} />
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
