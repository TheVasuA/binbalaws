import { IconSliders } from '@/components/ui/icons';

export function MaintenanceScreen({ brand, message }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-fg-muted">
          <IconSliders size={20} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{brand}</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-fg">Down for maintenance</h1>
        <p className="mt-2 text-sm text-fg-muted">{message}</p>
      </div>
    </main>
  );
}
