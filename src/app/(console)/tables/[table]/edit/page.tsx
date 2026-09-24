import Link from 'next/link';
import { DeleteButton } from '@/components/DeleteButton';
import { RowForm } from '@/components/RowForm';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { deleteWarning, tableLabel } from '@/lib/schema';
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
  searchParams: Promise<{ pk?: string }>;
}) {
  const { table } = await params;
  const query = await searchParams;
  if (!listTableNames().includes(table)) {
    return (
      <div className="card">
        <h1>没有这张表</h1>
      </div>
    );
  }
  const pk = query.pk?.trim() ?? '';
  const row = pk ? getRow(table, pk) : null;
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
  const form = describeForm(table, row);
  const warning = deleteWarning(table);
  const access = await requireAdmin();
  const allow = (action: string) => canAccess(access, actionPermission(`table:${table}`, action));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{pk ? `编辑${form.title}` : `新增${form.title}`}</h1>
          <p className="muted">
            <Link href={`/tables/${table}`}>{form.title}</Link>
          </p>
        </div>
        {pk && allow('delete') ? <DeleteButton table={table} pk={pk} warning={warning} /> : null}
      </div>
      <RowForm table={table} pk={form.pk} fields={form.fields} canSave={pk ? allow('update') : allow('create')} />
    </>
  );
}
