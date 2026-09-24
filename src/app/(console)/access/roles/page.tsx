import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { RoleForm } from '@/components/AccessForm';
import { deleteRoleAction } from '@/lib/actions';
import { canAccess, listRoles } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';

export const metadata = { title: '角色权限' };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const access = await requireAdmin();
  const allow = (action: string) => canAccess(access, actionPermission('access:roles', action));
  const roles = listRoles();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>角色权限</h1>
          <p>给角色勾选可以执行的按钮。超级管理员始终拥有全部操作。</p>
        </div>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>角色</th>
              <th>备注</th>
              <th>管理员数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role.remark || '—'}</td>
                <td>{role.userCount}</td>
                <td>
                  <div className="ops">
                    {allow('update') ? <Link href={`/access/roles/${role.id}`}>操作权限</Link> : null}
                    {role.builtIn || !allow('delete') ? null : (
                      <form action={deleteRoleAction}>
                        <input type="hidden" name="id" value={role.id} />
                        <button className="btn btn-tiny btn-danger" type="submit">
                          删除
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allow('create') ? (
        <>
          <h2>新建角色</h2>
          <RoleForm />
        </>
      ) : null}
    </>
  );
}
