import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { AdminUserForm } from '@/components/AccessForm';
import { deleteAdminUserAction } from '@/lib/actions';
import { canAccess, listAdminUsers, listRoles } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';

export const metadata = { title: '管理员' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const access = await requireAdmin();
  const allow = (action: string) => canAccess(access, actionPermission('access:users', action));
  const users = listAdminUsers();
  const roles = listRoles();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>管理员</h1>
          <p>自行注册的账号默认未启用。启用并分配角色后才能登录。</p>
        </div>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>账号</th>
              <th>角色</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4}>还没有后台管理员</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.roleName}</td>
                  <td>{user.enabled ? '是' : '否'}</td>
                  <td>
                    <div className="ops">
                      {allow('update') ? <Link href={`/access/users/${user.id}`}>编辑</Link> : null}
                      {allow('delete') ? (
                      <form action={deleteAdminUserAction}>
                        <input type="hidden" name="id" value={user.id} />
                        <button className="btn btn-tiny btn-danger" type="submit">
                          删除
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
      {allow('create') ? (
        <>
          <h2>新建管理员</h2>
          <AdminUserForm roles={roles.map((role) => ({ id: role.id, name: role.name }))} />
        </>
      ) : null}
    </>
  );
}
