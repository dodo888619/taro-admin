import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { StatusBadge } from '@/components/StatusBadge';
import { shipOrder } from '@/lib/actions';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { loadDashboard } from '@/lib/dashboard';
import { actionPermission } from '@/lib/menus';

export const metadata = { title: '概览' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const access = await requireAdmin();
  const canPublish = canAccess(access, actionPermission('product:new', 'create'));
  const canShip = canAccess(access, actionPermission('table:orders', 'ship'));
  const data = await loadDashboard();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <p>商品、订单和用户的当前数量</p>
        </div>
        {canPublish ? (
          <Link className="btn btn-primary" href="/products/new">
            发布商品
          </Link>
        ) : null}
      </div>
      <Flash saved={query.saved} error={query.error} />
      <section className="stats">
        <Link className="stat" href="/tables/users">
          <span>用户</span>
          <strong>{data.users}</strong>
        </Link>
        <Link className="stat" href="/products">
          <span>在售商品</span>
          <strong>{data.productsOn}</strong>
        </Link>
        <Link className="stat" href="/tables/orders?status=pending_ship">
          <span>待发货</span>
          <strong>{data.pendingShip}</strong>
        </Link>
        <Link className="stat" href="/tables/user_feedbacks">
          <span>用户反馈</span>
          <strong>{data.feedbacks}</strong>
        </Link>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>最近订单</h2>
          <Link href="/tables/orders">全部订单</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>商品</th>
                <th>规格</th>
                <th>数量</th>
                <th>积分</th>
                <th>状态</th>
                <th>下单时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.length === 0 ? (
                <tr>
                  <td colSpan={8}>还没有订单</td>
                </tr>
              ) : (
                data.orders.map((order) => (
                  <tr key={order.id}>
                    <td title={order.orderNo}>{order.orderNo}</td>
                    <td title={order.productName}>{order.productName}</td>
                    <td>{order.skuName}</td>
                    <td>{order.quantity}</td>
                    <td>{order.totalPoints}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>{order.createdAt}</td>
                    <td>
                      {order.status === 'pending_ship' && canShip ? (
                        <form action={shipOrder}>
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="back" value="/" />
                          <button className="btn btn-tiny" type="submit">
                            发货
                          </button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
