type ShipmentPopupCardProps = {
  trackingNumber: string;
  eta: string;
  riskLabel: string;
};

export default function ShipmentPopupCard({ trackingNumber, eta, riskLabel }: ShipmentPopupCardProps) {
  return (
    <div className="rounded-md bg-slate-900 p-2 text-xs text-slate-200">
      <div>{trackingNumber}</div>
      <div>ETA: {eta}</div>
      <div>Risk: {riskLabel}</div>
    </div>
  );
}
