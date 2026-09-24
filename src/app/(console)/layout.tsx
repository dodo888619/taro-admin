import { headers } from 'next/headers';
import { canAccess, menuTreeFromDb } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { menuCodeForPath, visibleMenuTree } from '@/lib/menus';
import { listTableNames } from '@/lib/tables';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdmin();
  const tables = listTableNames();
  const tree = visibleMenuTree(menuTreeFromDb(), new Set(access.menus), access.super);
  const pathname = (await headers()).get('x-pathname') ?? '/';
  const code = menuCodeForPath(pathname, tables);
  const allowed = code == null || canAccess(access, code);
  return (
    <div className="shell">
      <Sidebar tree={tree} username={access.username} />
      <div className="main">
        <div className="content">
          {allowed ? (
            children
          ) : (
            <div className="card">
              <h1>没有权限</h1>
              <p style={{ marginTop: 8 }}>当前角色不能打开这个菜单。请让超级管理员在「角色权限」里授权。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
