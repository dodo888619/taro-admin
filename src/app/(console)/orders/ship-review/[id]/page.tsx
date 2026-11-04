import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash } from '@/components/Flash';
import { StatusBadge } from '@/components/StatusBadge';
import { shipOrder } from '@/lib/actions';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import {
  buildShipChecks,
  getShipReviewOrder,
  shipReviewBlocked,
  type ShipCheckLevel,
} from '@/lib/orders';

export const metadata = { title: '发货审核详情' };

function badgeFor(level: ShipCheckLevel): string {
  switch (level) {
    case 'ok':
      return 'badge badge-ok';
    case 'warn':
      return 'badge badge-warn';
    case 'error':
      return 'badge badge-danger';
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

function levelLabel(level: ShipCheckLevel): string {
  switch (level) {
    case 'ok':
      return '通过';
    case 'warn':
      return '提醒';
    case 'error':
      return '阻断';
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export default async function ShipReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  const id = Number(rawId);
  const access = await requireAdmin();
  const canReview = canAccess(access, actionPermission('order:ship-review', 'ship'));
  const order = await getShipReviewOrder(id);
  if (!order) notFound();

  const checks = buildShipChecks(order);
  const blocked = shipReviewBlocked(checks);
  const back = `/orders/ship-review/${order.id}`;
  const region = [order.receiverProvince, order.receiverCity, order.receiverDistrict]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>发货审核 #{order.id}</h1>
          <p>
            订单号 {order.orderNo} · <StatusBadge status={order.status} />
            {order.status === 'pending_ship' ? '（已付款，等待运营审核）' : null}
          </p>
        </div>
        <div className="inline">
          <Link href="/orders/ship-review">返回列表</Link>
          <Link href={`/tables/orders/edit?pk=${order.id}`}>原始订单</Link>
        </div>
      </div>
      <Flash saved={query.saved} error={query.error} />

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>订单信息</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              <tr>
                <th>商品</th>
                <td>
                  {order.productName} / {order.skuName} × {order.quantity}
                </td>
              </tr>
              <tr>
                <th>积分</th>
                <td>
                  {order.totalPoints}（单价 {order.unitPoints}）
                </td>
              </tr>
              <tr>
                <th>下单时间</th>
                <td>{order.createdAt}</td>
              </tr>
              <tr>
                <th>支付时间</th>
                <td>{order.paidAt || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>用户与收货</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              <tr>
                <th>下单用户</th>
                <td>
                  {order.userNickname || order.userUsername || `#${order.userId}`}
                  {order.profileSchool ? ` · ${order.profileSchool}` : ''}
                </td>
              </tr>
              <tr>
                <th>用户联系方式</th>
                <td>
                  {order.userPhone || '无手机'}
                  {order.userEmail ? ` · ${order.userEmail}` : ''}
                </td>
              </tr>
              <tr>
                <th>收货人</th>
                <td>
                  {order.receiverName || '—'} {order.receiverPhone || ''}
                </td>
              </tr>
              <tr>
                <th>收货地址</th>
                <td>
                  {region || order.receiverDetail
                    ? `${region} ${order.receiverDetail || ''}`.trim()
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>审核检查</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>检查项</th>
                <th>结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((item) => (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td>
                    <span className={badgeFor(item.level)}>{levelLabel(item.level)}</span>
                  </td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.status === 'pending_ship' && canReview ? (
        <form action={shipOrder} className="inline">
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="back" value={blocked ? back : '/orders/ship-review'} />
          <button className="btn btn-primary" type="submit" disabled={blocked}>
            {blocked ? '存在阻断项，无法审核通过' : '审核通过并标记已发货'}
          </button>
        </form>
      ) : null}

      {order.status !== 'pending_ship' ? (
        <p className="note">当前不是待发货状态，无需审核。</p>
      ) : null}
    </>
  );
}
