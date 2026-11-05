import Link from 'next/link';
import { DeleteButton } from '@/components/DeleteButton';
import { RowForm } from '@/components/RowForm';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { deleteWarning, tableAllowsCreate, tableLabel } from '@/lib/schema';
import { describeForm, getRow, listTableNames } from '@/lib/tables';

export async function generateMetadata({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  return { title: `编辑${tableLabel(table)}` };
}

export default async function EditRowPage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ pk?: string; position?: string }>;
}) {
  const { table } = await params;
  const query = await searchParams;
  if (!(await listTableNames()).includes(table)) {
    return (
      <div className="card">
        <h1>没有这张表</h1>
      </div>
    );
  }
  const pk = query.pk?.trim() ?? '';
  const row = pk ? await getRow(table, pk) : null;
  if (pk && !row) {
    return (
      <div className="card">
        <h1>记录不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href={`/tables/${table}`}>返回列表</Link>
        </p>
      </div>
    );
  }
  const form = await describeForm(table, row);
  if (!pk && table === 'banners') {
    const position = query.position?.trim() ?? '';
    if (position) {
      for (const field of form.fields) {
        if (field.name === 'position') field.value = position;
      }
    }
  }
  const warning = deleteWarning(table);
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
  if (!pk && !tableAllowsCreate(table)) {
    return (
      <div className="card">
        <h1>不能新增</h1>
        <p style={{ marginTop: 8 }}>
          {table === 'orders' ? '订单由用户下单产生，后台不能新增。' : null}
          {table === 'users' ? '用户由客户端注册/登录产生，后台不能新增。' : null}
          {table === 'product_skus' ? (
            <>
              规格请在
              <Link href="/products/new">发布商品</Link>
              或商品编辑里添加。
            </>
          ) : null}{' '}
          <Link href={`/tables/${table}`}>返回列表</Link>
        </p>
      </div>
    );
  }
  if (table === 'products' && !pk) {
    return (
      <div className="card">
        <h1>请走发布商品</h1>
        <p style={{ marginTop: 8 }}>
          上架新商品请使用<Link href="/products/new">发布商品</Link>，以便同时写入规格和提示。
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{pk ? `编辑${form.title}` : `新增${form.title}`}</h1>
          <p className="muted">
            <Link
              href={
                table === 'products'
                  ? '/products'
                  : table === 'banners'
                    ? '/tables/banner_positions'
                    : `/tables/${table}`
              }
            >
              {table === 'banners' ? '广告展示位置' : form.title}
            </Link>
          </p>
        </div>
        {pk && allow('delete') ? <DeleteButton table={table} pk={pk} warning={warning} /> : null}
      </div>
      <RowForm table={table} pk={form.pk} fields={form.fields} canSave={pk ? allow('update') : allow('create')} />
    </>
  );
}
