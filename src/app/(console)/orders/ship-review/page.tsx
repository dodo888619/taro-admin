import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { StatusBadge } from '@/components/StatusBadge';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import {
  buildShipChecks,
  listPendingShipReviews,
  shipReviewBlocked,
} from '@/lib/orders';

export const metadata = { title: '发货审核' };

export default async function ShipReviewListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const access = await requireAdmin();
  const canReview = canAccess(access, actionPermission('order:ship-review', 'ship'));
  const orders = await listPendingShipReviews();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>发货审核</h1>
          <p>
            待发货 = 已付款未审核。核对用户与收货信息、商品库存后，通过审核即变为已发货。
          </p>
        </div>
        <Link href="/tables/orders?status=pending_ship">原始订单表</Link>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>用户</th>
              <th>收货人</th>
              <th>商品 / 规格</th>
              <th>数量</th>
              <th>积分</th>
              <th>库存复核</th>
              <th>审核项</th>
              <th>支付时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={10}>暂无待审核发货订单</td>
              </tr>
            ) : (
              orders.map((order) => {
                const checks = buildShipChecks(order);
                const blocked = shipReviewBlocked(checks);
                const errorCount = checks.filter((item) => item.level === 'error').length;
                const warnCount = checks.filter((item) => item.level === 'warn').length;
                const userLabel =
                  order.userNickname || order.userUsername || `#${order.userId}`;
                const receiver = order.receiverName
                  ? `${order.receiverName} ${order.receiverPhone || ''}`.trim()
                  : '—';
                return (
                  <tr key={order.id}>
                    <td title={order.orderNo}>{order.orderNo}</td>
                    <td title={order.userPhone || order.userEmail || ''}>{userLabel}</td>
                    <td>{receiver}</td>
                    <td title={`${order.productName} / ${order.skuName}`}>
                      {order.productName}
                      <br />
                      <span className="muted">{order.skuName}</span>
                    </td>
                    <td>{order.quantity}</td>
                    <td>{order.totalPoints}</td>
                    <td>
                      {order.skuStock == null
                        ? '规格缺失'
                        : `可售 ${order.skuStock} / 锁定 ${order.skuLocked ?? 0}`}
                    </td>
                    <td>
                      {blocked ? (
                        <span className="badge badge-danger">{errorCount} 项阻断</span>
                      ) : warnCount > 0 ? (
                        <span className="badge badge-warn">{warnCount} 项提醒</span>
                      ) : (
                        <span className="badge badge-ok">可审核</span>
                      )}
                    </td>
                    <td>{order.paidAt || '—'}</td>
                    <td>
                      {canReview ? (
                        <Link href={`/orders/ship-review/${order.id}`}>去审核</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        状态说明：待付款（未付款）→ 待发货（已付款待审核）→ 已发货（已审核）→ 已完成（用户确认收货）。
        <StatusBadge status="pending_ship" />
      </p>
    </>
  );
}
