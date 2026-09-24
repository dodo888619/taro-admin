import { TABLE_GROUPS, tableLabel } from './schema';

export type MenuAction = {
  code: string;
  label: string;
};

export type MenuNode = {
  code: string;
  label: string;
  href?: string;
  actions?: MenuAction[];
  children?: MenuNode[];
};

const CRUD: MenuAction[] = [
  { code: 'view', label: '查看' },
  { code: 'create', label: '新增' },
  { code: 'update', label: '编辑' },
  { code: 'delete', label: '删除' },
];

export function menuActions(menuCode: string): MenuAction[] {
  if (menuCode === 'dashboard') return [{ code: 'view', label: '查看' }];
  if (menuCode === 'product:new') return [{ code: 'create', label: '发布' }];
  if (menuCode === 'product:list') return [
    { code: 'view', label: '查看' },
    { code: 'update', label: '编辑' },
  ];
  if (menuCode === 'table:orders') return [...CRUD, { code: 'ship', label: '发货' }];
  if (menuCode.startsWith('table:') || menuCode.startsWith('access:')) return CRUD;
  return [{ code: 'view', label: '查看' }];
}

export function actionPermission(menuCode: string, action: string): string {
  return `${menuCode}:${action}`;
}

export function permissionCodes(node: MenuNode): string[] {
  if (node.children) return node.children.flatMap(permissionCodes);
  return (node.actions ?? []).map((action) => actionPermission(node.code, action.code));
}

const TOP_MENUS: MenuNode[] = [
  { code: 'dashboard', label: '概览', href: '/' },
  { code: 'product:new', label: '发布商品', href: '/products/new' },
  { code: 'product:list', label: '商品列表', href: '/products' },
];

const ACCESS_MENUS: MenuNode = {
  code: 'group:access',
  label: '系统管理',
  children: [
    { code: 'access:roles', label: '角色权限', href: '/access/roles' },
    { code: 'access:users', label: '管理员', href: '/access/users' },
    { code: 'access:menus', label: '菜单管理', href: '/access/menus' },
  ],
};

export function buildMenuTree(tableNames: string[]): MenuNode[] {
  const known = new Set<string>();
  const groups: MenuNode[] = [];
  for (const group of TABLE_GROUPS) {
    const children = group.tables
      .filter((name) => tableNames.includes(name))
      .map((name) => {
        known.add(name);
        return {
          code: `table:${name}`,
          label: tableLabel(name),
          href: `/tables/${name}`,
        };
      });
    if (children.length > 0) {
      groups.push({ code: `group:${group.id}`, label: group.title, children });
    }
  }
  const rest = tableNames.filter((name) => !known.has(name));
  if (rest.length > 0) {
    groups.push({
      code: 'group:other',
      label: '其他',
      children: rest.map((name) => ({
        code: `table:${name}`,
        label: tableLabel(name),
        href: `/tables/${name}`,
      })),
    });
  }
  return [...TOP_MENUS, ...groups, ACCESS_MENUS];
}

export type MenuSeed = {
  code: string;
  name: string;
  href: string;
  parentCode: string;
  sort: number;
};

export function menuSeeds(tableNames: string[]): MenuSeed[] {
  const seeds: MenuSeed[] = [];
  let sort = 0;
  for (const node of buildMenuTree(tableNames)) {
    if (node.children) {
      seeds.push({ code: node.code, name: node.label, href: '', parentCode: '', sort });
      sort += 1;
      node.children.forEach((child, index) => {
        seeds.push({
          code: child.code,
          name: child.label,
          href: child.href ?? '',
          parentCode: node.code,
          sort: index,
        });
      });
      continue;
    }
    seeds.push({ code: node.code, name: node.label, href: node.href ?? '', parentCode: '', sort });
    sort += 1;
  }
  return seeds;
}

export function leafMenus(tree: MenuNode[]): Array<{ code: string; label: string }> {
  const leaves: Array<{ code: string; label: string }> = [];
  for (const node of tree) {
    if (node.children) {
      for (const child of node.children) {
        if (child.href) leaves.push({ code: child.code, label: child.label });
      }
      continue;
    }
    if (node.href) leaves.push({ code: node.code, label: node.label });
  }
  return leaves;
}

function menuAllowed(allowed: Set<string>, code: string): boolean {
  if (allowed.has(code)) return true;
  const prefix = `${code}:`;
  for (const item of allowed) {
    if (item.startsWith(prefix)) return true;
  }
  return false;
}

export function visibleMenuTree(tree: MenuNode[], allowed: Set<string>, superUser: boolean): MenuNode[] {
  if (superUser) return tree;
  const visible: MenuNode[] = [];
  for (const node of tree) {
    if (node.children) {
      const children = node.children.filter((child) => menuAllowed(allowed, child.code));
      if (children.length > 0) visible.push({ ...node, children });
      continue;
    }
    if (menuAllowed(allowed, node.code)) visible.push(node);
  }
  return visible;
}

export function menuCodeForPath(pathname: string, tableNames: string[]): string | null {
  if (pathname === '/' || pathname === '/forbidden') return pathname === '/' ? 'dashboard' : null;
  if (pathname === '/products/new') return 'product:new';
  if (pathname === '/products' || /^\/products\/\d+$/.test(pathname)) return 'product:list';
  if (pathname === '/access/roles' || pathname.startsWith('/access/roles/')) return 'access:roles';
  if (pathname === '/access/users' || pathname.startsWith('/access/users/')) return 'access:users';
  if (pathname === '/access/menus' || pathname.startsWith('/access/menus/')) return 'access:menus';
  const match = pathname.match(/^\/tables\/([A-Za-z_][A-Za-z0-9_]*)(?:\/edit)?$/);
  if (match && tableNames.includes(match[1])) return `table:${match[1]}`;
  return '__none';
}
