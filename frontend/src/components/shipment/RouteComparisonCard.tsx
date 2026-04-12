import SectionCard from '../common/SectionCard.tsx';

export default function RouteComparisonCard() {
  return (
    <SectionCard title="Route Comparison" subtitle="Current route vs new suggested route">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-300">
              <th className="py-2">Metric</th>
              <th className="py-2">Current Route</th>
              <th className="py-2">New Route</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            <tr><td className="py-2">ETA</td><td>14h 20m</td><td>12h 50m</td></tr>
            <tr><td className="py-2">Distance</td><td>620 km</td><td>680 km</td></tr>
            <tr><td className="py-2">Risk</td><td>High</td><td>Medium</td></tr>
            <tr><td className="py-2">Weather Exposure</td><td>Severe</td><td>Low</td></tr>
            <tr><td className="py-2">Stops</td><td>4</td><td>3</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-emerald-300">
        Recommended route avoids severe rainfall corridor and lowers delay probability from 72% to 31%.
      </p>
    </SectionCard>
  );
}
