type EmptyStateProps = {
  label: string;
};

export default function EmptyState({ label }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
      {label}
    </div>
  );
}
