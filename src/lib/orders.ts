import 'server-only';
import { getDb } from './db';
import { TableError } from './errors';

export function shipPendingOrder(id: number): void {
  if (!Number.isInteger(id) || id <= 0) throw new TableError('订单无效');
  const result = getDb()
    .prepare(
      `UPDATE orders
       SET status = 'shipped', shippedAt = datetime('now'), updatedAt = datetime('now')
       WHERE id = ? AND status = 'pending_ship'`,
    )
    .run(id);
  if (result.changes === 0) throw new TableError('仅待发货订单可发货');
}
