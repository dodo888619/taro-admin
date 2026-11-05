import Link from 'next/link';
import { BannerPositionGroups } from '@/components/BannerPositionGroups';
import { Flash } from '@/components/Flash';
import { StatusBadge } from '@/components/StatusBadge';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { listBannerPositionGroups } from '@/lib/banner-positions';
import { actionPermission } from '@/lib/menus';
import { orderStatusLabel, tableAllowsCreate, tableLabel } from '@/lib/schema';
import { listRows, listTableNames } from '@/lib/tables';

const ORDER_STATUSES = [
  'pending_pay',
  'pending_ship',
  'shipped',
  'completed',
  'cancelled',
];

function parsePage(value: string | undefined): number {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

function listHref(table: string, page: number, q: string, status: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return search ? `/tables/${table}?${search}` : `/tables/${table}`;
}

export async function generateMetadata({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  return { title: tableLabel(table) };
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ q?: string; page?: string; status?: string; saved?: string; error?: string }>;
}) {
  const { table } = await params;
  const query = await searchParams;
  if (!(await listTableNames()).includes(table)) {
    return (
      <div className="card">
        <h1>没有这张表</h1>
        <p style={{ marginTop: 8 }}>请从左侧选择要维护的数据表。</p>
      </div>
    );
  }
  const q = (query.q ?? '').trim();
  const status = table === 'orders' && query.status && ORDER_STATUSES.includes(query.status) ? query.status : '';
  const page = parsePage(query.page);
  const access = await requireAdmin();
  const allow = (action: string) => {
    if (action === 'create' && !tableAllowsCreate(table)) return false;
    if (table === 'products') {
      if (action === 'create') return canAccess(access, actionPermission('product:new', 'create'));
      if (action === 'view') return canAccess(access, actionPermission('product:list', 'view'));
      if (action === 'update' || action === 'delete') {
        return canAccess(access, actionPermission('product:list', 'update'));
      }
    }
    return canAccess(access, actionPermission(`table:${table}`, action));
  };

  if (table === 'banner_positions') {
    const { groups, orphanBanners } = await listBannerPositionGroups();
    return (
      <>
        <div className="page-head">
          <div>
            <h1>{tableLabel(table)}</h1>
            <p className="muted">按展示位置分组查看广告位</p>
          </div>
          <div className="inline">
            <Link href="/tables/banners">广告位原始表</Link>
            {allow('create') ? (
              <Link className="btn btn-primary" href={`/tables/${table}/edit`}>
                新增位置
              </Link>
            ) : null}
          </div>
        </div>
        <Flash saved={query.saved} error={query.error} />
        <BannerPositionGroups
          groups={groups}
          orphanBanners={orphanBanners}
          canEditPosition={allow('update')}
          canCreateBanner={canAccess(access, actionPermission('table:banners', 'create'))}
          canEditBanner={canAccess(access, actionPermission('table:banners', 'update'))}
        />
      </>
    );
  }

  const result = await listRows(table, {
    page,
    q,
    exact: status ? { status } : undefined,
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tableLabel(table)}</h1>
          <p className="muted">{table}</p>
        </div>
        {table === 'products' ? (
          allow('create') ? (
            <Link className="btn btn-primary" href="/products/new">
              发布商品
            </Link>
          ) : null
        ) : allow('create') ? (
          <Link className="btn btn-primary" href={`/tables/${table}/edit`}>
            新增
          </Link>
        ) : null}
      </div>
      <Flash saved={query.saved} error={query.error} />
      {table === 'products' ? (
        <p className="note">
          日常维护请走<Link href="/products">商品列表</Link>
          。本页为原始表，上架请用发布商品以便同时写入规格和提示。
        </p>
      ) : null}
      {table === 'banners' ? (
        <p className="note">
          建议在
          <Link href="/tables/banner_positions">广告展示位置</Link>
          中按位置分组维护广告位。
        </p>
      ) : null}
      {table === 'orders' ? (
        <p className="note">
          订单由用户下单产生，后台不能新增。待发货请走
          <Link href="/orders/ship-review">发货审核</Link>
          。直接改状态不会退回积分或调整库存。
        </p>
      ) : null}
      {table === 'users' ? (
        <p className="note">用户由客户端注册/登录产生，后台不能新增，仅可查看与维护。</p>
      ) : null}
      {table === 'product_skus' ? (
        <p className="note">
          规格请在
          <Link href="/products/new">发布商品</Link>
          或商品编辑里维护，本页仅可查看与改现有规格。
        </p>
      ) : null}
      <div className="toolbar">
        <form method="get">
          <input name="q" defaultValue={q} placeholder="搜索文本或 ID" />
          {table === 'orders' ? (
            <select name="status" defaultValue={status}>
              <option value="">全部状态</option>
              {ORDER_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {orderStatusLabel(item)}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn" type="submit">
            搜索
          </button>
        </form>
        <p className="muted">共 {result.total} 条</p>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name}>{column.label}</th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={result.columns.length + 1}>没有记录</td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.pk}>
                  {row.cells.map((cell, index) => (
                    <td key={result.columns[index]?.name ?? index} title={cell.title}>
                      {table === 'orders' && result.columns[index]?.name === 'status' && row.status ? (
                        <StatusBadge status={row.status} />
                      ) : (
                        cell.text
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="ops">
                      {allow('update') ? (
                        <Link href={`/tables/${table}/edit?pk=${encodeURIComponent(row.pk)}`}>编辑</Link>
                      ) : null}
                      {table === 'orders' &&
                      row.status === 'pending_ship' &&
                      (allow('ship') ||
                        canAccess(access, actionPermission('order:ship-review', 'ship'))) ? (
                        <Link href={`/orders/ship-review/${row.pk}`}>去审核</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        {result.page > 1 ? <Link href={listHref(table, result.page - 1, q, status)}>上一页</Link> : <span>上一页</span>}
        <span>
          第 {result.page} / {result.pages} 页
        </span>
        {result.page < result.pages ? (
          <Link href={listHref(table, result.page + 1, q, status)}>下一页</Link>
        ) : (
          <span>下一页</span>
        )}
      </div>
    </>
  );
}
