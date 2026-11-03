import 'server-only';
import { db } from './db';
import { TableError } from './errors';

export async function shipPendingOrder(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new TableError('订单无效');
  const result = await db.run(
    `UPDATE orders
     SET status = 'shipped', shippedAt = UTC_TIMESTAMP(), updatedAt = UTC_TIMESTAMP()
     WHERE id = ? AND status = 'pending_ship'`,
    id,
  );
  if (result.changes === 0) throw new TableError('仅待发货订单可发货');
}
