'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/lib/actions';
import type { MenuNode } from '@/lib/menus';

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/products') return pathname === '/products' || /^\/products\/\d+$/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MenuLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  return (
    <Link href={href} aria-current={isCurrent(pathname, href) ? 'page' : undefined}>
      {label}
    </Link>
  );
}

export function Sidebar({ tree, username }: { tree: MenuNode[]; username: string }) {
  const blocks: React.ReactNode[] = [];
  const loose: MenuNode[] = [];
  const flush = (key: string) => {
    if (loose.length === 0) return;
    blocks.push(
      <div className="nav-sub" key={key}>
        {loose.splice(0).map((item) => (
          <MenuLink key={item.code} href={item.href ?? '/'} label={item.label} />
        ))}
      </div>,
    );
  };
  tree.forEach((node, index) => {
    if (node.children) {
      flush(`loose-${index}`);
      blocks.push(
        <div key={node.code}>
          <p className="nav-label">{node.label}</p>
          <div className="nav-sub">
            {node.children.map((child) => (
              <MenuLink key={child.code} href={child.href ?? '/'} label={child.label} />
            ))}
          </div>
        </div>,
      );
      return;
    }
    loose.push(node);
  });
  flush('loose-end');

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">投</span>
        <span>
          <strong>投投管理</strong>
          <small>商品与数据</small>
        </span>
      </div>
      <nav className="nav">{blocks}</nav>
      <p className="sidebar-user">{username}</p>
      <form action={logoutAction}>
        <button className="sidebar-logout" type="submit">
          退出登录
        </button>
      </form>
    </aside>
  );
}
