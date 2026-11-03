import Link from 'next/link';
import { MenuForm } from '@/components/AccessForm';
import { getAdminMenu, listAdminMenus } from '@/lib/access';

export const metadata = { title: '编辑菜单' };

export default async function EditMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const menu = /^\d+$/.test(id) ? await getAdminMenu(Number(id)) : null;
  if (!menu) {
    return (
      <div className="card">
        <h1>菜单不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/access/menus">返回菜单列表</Link>
        </p>
      </div>
    );
  }
  const parents = (await listAdminMenus())
    .filter((item) => !item.href && item.id !== menu.id)
    .map((item) => ({ id: item.id, name: item.name }));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{menu.name}</h1>
          <p>
            <Link href="/access/menus">返回菜单列表</Link>
          </p>
        </div>
      </div>
      <MenuForm
        id={menu.id}
        name={menu.name}
        href={menu.href}
        parentId={menu.parentId}
        sort={menu.sort}
        enabled={menu.enabled}
        builtIn={menu.builtIn}
        parents={parents}
      />
    </>
  );
}
