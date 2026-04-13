import StatusBadge from '../common/StatusBadge.tsx';
import { getStatusTone } from '../../utils/statusColors.ts';

type ShipmentPopupCardProps = {
  trackingNumber: string;
  status: string;
  priority?: string;
  locationLabel?: string;
  riskLabel: string;
};

export default function ShipmentPopupCard({
  trackingNumber,
  status,
  priority,
  locationLabel,
  riskLabel
}: ShipmentPopupCardProps) {
  return (
    <div className="min-w-[170px] rounded-md bg-slate-950 p-2 text-xs text-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{trackingNumber}</p>
        <StatusBadge text={status.replace('_', ' ')} tone={getStatusTone(status)} />
      </div>
      <div className="mt-1 space-y-0.5 text-slate-300">
        <p>Risk: {riskLabel}</p>
        {priority ? <p>Priority: {priority}</p> : null}
        {locationLabel ? <p>{locationLabel}</p> : null}
      </div>
    </div>
  );
}
