type AlertToast = {
  id: string;
  title: string;
};

type AlertToastStackProps = {
  toasts: AlertToast[];
};

export default function AlertToastStack({ toasts }: AlertToastStackProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
          {toast.title}
        </div>
      ))}
    </div>
  );
}
