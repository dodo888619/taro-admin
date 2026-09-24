import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { MenuForm } from '@/components/AccessForm';
import { deleteAdminMenuAction } from '@/lib/actions';
import { canAccess, listAdminMenus } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';

export const metadata = { title: '菜单管理' };

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const access = await requireAdmin();
  const allow = (action: string) => canAccess(access, actionPermission('access:menus', action));
  const menus = listAdminMenus();
  const parents = menus.filter((menu) => !menu.href).map((menu) => ({ id: menu.id, name: menu.name }));
  const ordered = menus.flatMap((menu) => {
    if (menu.parentId) return [];
    return [menu, ...menus.filter((child) => child.parentId === menu.id)];
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>菜单管理</h1>
          <p>调整名称、排序和是否显示。系统菜单可以停用，自定义菜单可以删除。</p>
        </div>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>路径</th>
              <th>上级</th>
              <th>排序</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((menu) => (
              <tr key={menu.id}>
                <td>{menu.parentId ? `└ ${menu.name}` : menu.name}</td>
                <td>{menu.href || '—'}</td>
                <td>{menu.parentName || '—'}</td>
                <td>{menu.sort}</td>
                <td>{menu.enabled ? '是' : '否'}</td>
                <td>
                  <div className="ops">
                    {allow('update') ? <Link href={`/access/menus/${menu.id}`}>编辑</Link> : null}
                    {menu.builtIn || !allow('delete') ? null : (
                      <form action={deleteAdminMenuAction}>
                        <input type="hidden" name="id" value={menu.id} />
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
          <h2>新建菜单</h2>
          <MenuForm parents={parents} />
        </>
      ) : null}
    </>
  );
}
