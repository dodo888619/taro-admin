import Link from 'next/link';
import { AdminUserForm } from '@/components/AccessForm';
import { getAdminUser, listRoles } from '@/lib/access';

export const metadata = { title: '编辑管理员' };

export default async function EditAdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = /^\d+$/.test(id) ? await getAdminUser(Number(id)) : null;
  if (!user) {
    return (
      <div className="card">
        <h1>管理员不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/access/users">返回管理员列表</Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.username}</h1>
          <p>
            <Link href="/access/users">返回管理员列表</Link>
          </p>
        </div>
      </div>
      <AdminUserForm
        id={user.id}
        username={user.username}
        roleIds={user.roleIds}
        enabled={user.enabled}
        roles={(await listRoles()).map((role) => ({ id: role.id, name: role.name }))}
      />
    </>
  );
}
