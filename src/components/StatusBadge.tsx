import { orderStatusLabel } from '@/lib/schema';

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'pending_ship'
      ? 'warn'
      : status === 'shipped'
        ? 'info'
        : status === 'completed'
          ? 'ok'
          : status === 'pending_pay'
            ? 'muted'
            : 'danger';
  return <span className={`badge badge-${tone}`}>{orderStatusLabel(status)}</span>;
}
