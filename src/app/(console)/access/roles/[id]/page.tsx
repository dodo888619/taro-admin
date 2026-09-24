import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { RoleForm } from '@/components/AccessForm';
import { RoleMenuForm } from '@/components/RoleMenuForm';
import { getRole, menuTreeFromDb, roleMenuCodes } from '@/lib/access';
import { permissionCodes } from '@/lib/menus';

export const metadata = { title: '编辑角色' };

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const role = /^\d+$/.test(id) ? getRole(Number(id)) : null;
  if (!role) {
    return (
      <div className="card">
        <h1>角色不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/access/roles">返回角色列表</Link>
        </p>
      </div>
    );
  }
  const tree = menuTreeFromDb();
  const granted = role.code === 'super' ? tree.flatMap(permissionCodes) : roleMenuCodes(role.id);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{role.name}</h1>
          <p>
            <Link href="/access/roles">返回角色列表</Link>
          </p>
        </div>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <RoleForm id={role.id} name={role.name} remark={role.remark} />
      <RoleMenuForm roleId={role.id} tree={tree} granted={granted} locked={role.code === 'super'} />
    </>
  );
}
