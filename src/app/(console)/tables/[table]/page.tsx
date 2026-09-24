import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { StatusBadge } from '@/components/StatusBadge';
import { shipOrder } from '@/lib/actions';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { orderStatusLabel, tableLabel } from '@/lib/schema';
import { listRows, listTableNames } from '@/lib/tables';

const ORDER_STATUSES = [
  'pending_pay',
  'pending_ship',
  'shipped',
  'completed',
  'cancelled',
  'failed',
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
  if (!listTableNames().includes(table)) {
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
  const result = listRows(table, {
    page,
    q,
    exact: status ? { status } : undefined,
  });
  const back = listHref(table, result.page, q, status);
  const access = await requireAdmin();
  const allow = (action: string) => canAccess(access, actionPermission(`table:${table}`, action));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tableLabel(table)}</h1>
          <p className="muted">{table}</p>
        </div>
        {allow('create') ? (
          <Link className="btn btn-primary" href={`/tables/${table}/edit`}>
            新增
          </Link>
        ) : null}
      </div>
      <Flash saved={query.saved} error={query.error} />
      {table === 'products' ? (
        <p className="note">
          上架新商品请走<Link href="/products/new">发布商品</Link>，以便同时写入规格和提示。
        </p>
      ) : null}
      {table === 'orders' ? (
        <p className="note">发货请用列表中的按钮。直接改状态不会退回积分或调整库存。</p>
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
                      {table === 'orders' && row.status === 'pending_ship' && allow('ship') ? (
                        <form action={shipOrder}>
                          <input type="hidden" name="id" value={row.pk} />
                          <input type="hidden" name="back" value={back} />
                          <button className="btn btn-tiny" type="submit">
                            发货
                          </button>
                        </form>
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
