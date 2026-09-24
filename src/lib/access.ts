import 'server-only';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getDb } from './db';
import { TableError } from './errors';
import { actionPermission, menuActions, menuSeeds, type MenuNode } from './menus';
import { listTableNames } from './tables';

export type AdminAccess = {
  username: string;
  super: boolean;
  menus: string[];
};

export type AdminRole = {
  id: number;
  code: string;
  name: string;
  remark: string;
  builtIn: boolean;
  userCount: number;
};

type AdminRoleRow = {
  id: number;
  code: string;
  name: string;
  remark: string;
  builtIn: number;
  userCount: number;
};

export type AdminAccount = {
  id: number;
  username: string;
  roleIds: number[];
  roleName: string;
  enabled: boolean;
};

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function columnNames(table: string): string[] {
  const db = getDb();
  const exists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  if (!exists) return [];
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function syncMenus(): void {
  const db = getDb();
  const seeds = menuSeeds(listTableNames());
  const upsert = db.prepare(
    `INSERT INTO admin_menus (code, name, href, sort, enabled)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(code) DO UPDATE SET
       href = excluded.href,
       updatedAt = datetime('now')`,
  );
  for (const seed of seeds) upsert.run(seed.code, seed.name, seed.href, seed.sort);
  db.prepare(
    `UPDATE admin_menus SET name = '系统管理', updatedAt = datetime('now')
     WHERE code = 'group:access' AND name = '权限'`,
  ).run();
  db.prepare(
    `UPDATE admin_menus SET name = '工具', updatedAt = datetime('now')
     WHERE code = 'group:system' AND name = '系统'`,
  ).run();
  const ids = new Map(
    (db.prepare(`SELECT id, code FROM admin_menus`).all() as Array<{ id: number; code: string }>).map(
      (row) => [row.code, row.id],
    ),
  );
  const setParent = db.prepare(
    `UPDATE admin_menus SET parentId = ? WHERE code = ? AND parentId IS NULL`,
  );
  for (const seed of seeds) {
    if (!seed.parentCode) continue;
    setParent.run(ids.get(seed.parentCode) ?? null, seed.code);
  }
  const codes = seeds.map((seed) => seed.code);
  db.prepare(
    `UPDATE admin_menus SET enabled = 0, updatedAt = datetime('now')
     WHERE code NOT LIKE 'menu_%' AND code NOT IN (${codes.map(() => '?').join(',')})`,
  ).run(...codes);
}

export function ensureAccess(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      href TEXT NOT NULL DEFAULT '',
      parentId INTEGER,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admin_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      builtIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admin_user_roles (
      userId INTEGER NOT NULL,
      roleId INTEGER NOT NULL,
      PRIMARY KEY (userId, roleId)
    );
  `);
  if (columnNames('admin_users').includes('roleId')) {
    db.exec(`
      ALTER TABLE admin_users RENAME TO admin_users_old;
      CREATE TABLE admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO admin_users (id, username, passwordHash, enabled, createdAt, updatedAt)
      SELECT id, username, passwordHash, enabled, createdAt, updatedAt FROM admin_users_old;
      INSERT OR IGNORE INTO admin_user_roles (userId, roleId)
      SELECT id, roleId FROM admin_users_old;
      DROP TABLE admin_users_old;
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  syncMenus();
  if (columnNames('admin_role_menus').includes('menuCode')) {
    db.exec(`ALTER TABLE admin_role_menus RENAME TO admin_role_menus_old`);
    db.exec(`
      CREATE TABLE admin_role_menus (
        roleId INTEGER NOT NULL,
        menuId INTEGER NOT NULL,
        PRIMARY KEY (roleId, menuId)
      );
      INSERT OR IGNORE INTO admin_role_menus (roleId, menuId)
      SELECT old.roleId, menu.id
      FROM admin_role_menus_old old
      JOIN admin_menus menu ON menu.code = old.menuCode;
      DROP TABLE admin_role_menus_old;
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_role_menus (
        roleId INTEGER NOT NULL,
        menuId INTEGER NOT NULL,
        PRIMARY KEY (roleId, menuId)
      );
    `);
  }
  const existing = db.prepare(`SELECT id FROM admin_roles WHERE code = 'super'`).get() as
    | { id: number }
    | undefined;
  const superId = existing
    ? existing.id
    : Number(
        db.prepare(
          `INSERT INTO admin_roles (code, name, remark, builtIn) VALUES ('super', '超级管理员', '拥有全部菜单', 1)`,
        ).run().lastInsertRowid,
      );
  const grant = db.prepare(
    `INSERT OR IGNORE INTO admin_role_menus (roleId, menuId)
     SELECT ?, id FROM admin_menus WHERE enabled = 1 AND href != ''`,
  );
  grant.run(superId);
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_role_actions (
      roleId INTEGER NOT NULL,
      code TEXT NOT NULL,
      PRIMARY KEY (roleId, code)
    );
  `);
  migrateMenuGrants();
}

function migrateMenuGrants(): void {
  const db = getDb();
  const roles = db
    .prepare(
      `SELECT DISTINCT rm.roleId
       FROM admin_role_menus rm
       WHERE NOT EXISTS (SELECT 1 FROM admin_role_actions a WHERE a.roleId = rm.roleId)`,
    )
    .all() as Array<{ roleId: number }>;
  const menus = db.prepare(
    `SELECT m.code FROM admin_role_menus rm JOIN admin_menus m ON m.id = rm.menuId WHERE rm.roleId = ?`,
  );
  const insert = db.prepare(`INSERT OR IGNORE INTO admin_role_actions (roleId, code) VALUES (?, ?)`);
  const clear = db.prepare(`DELETE FROM admin_role_menus WHERE roleId = ?`);
  for (const role of roles) {
    const rows = menus.all(role.roleId) as Array<{ code: string }>;
    for (const row of rows) {
      for (const action of menuActions(row.code)) insert.run(role.roleId, actionPermission(row.code, action.code));
    }
    clear.run(role.roleId);
  }
}

function leafCodes(): Set<string> {
  const rows = getDb()
    .prepare(`SELECT code FROM admin_menus WHERE enabled = 1 AND href != ''`)
    .all() as Array<{ code: string }>;
  return new Set(rows.map((row) => row.code));
}

export function canAccess(access: AdminAccess, code: string): boolean {
  if (access.super || access.menus.includes(code)) return true;
  const prefix = `${code}:`;
  return access.menus.some((item) => item.startsWith(prefix));
}

export function loadAccess(username: string): AdminAccess | null {
  ensureAccess();
  if (username && username === (process.env.ADMIN_USERNAME ?? '')) {
    return { username, super: true, menus: [...leafCodes()] };
  }
  const row = getDb()
    .prepare(`SELECT username, enabled FROM admin_users WHERE username = ?`)
    .get(username) as { username: string; enabled: number } | undefined;
  if (!row || !row.enabled) return null;
  const roles = getDb()
    .prepare(
      `SELECT r.code
       FROM admin_roles r
       JOIN admin_user_roles ur ON ur.roleId = r.id
       JOIN admin_users u ON u.id = ur.userId
       WHERE u.username = ?`,
    )
    .all(username) as Array<{ code: string }>;
  if (roles.some((role) => role.code === 'super')) {
    return { username: row.username, super: true, menus: [...leafCodes()] };
  }
  const menus = getDb()
    .prepare(
      `SELECT DISTINCT a.code
       FROM admin_role_actions a
       JOIN admin_user_roles ur ON ur.roleId = a.roleId
       JOIN admin_users u ON u.id = ur.userId
       WHERE u.username = ?`,
    )
    .all(username) as Array<{ code: string }>;
  return { username: row.username, super: false, menus: menus.map((item) => item.code) };
}

export function authenticate(
  username: string,
  password: string,
): { ok: true } | { ok: false; error: string } {
  ensureAccess();
  const row = getDb()
    .prepare(`SELECT passwordHash, enabled FROM admin_users WHERE username = ?`)
    .get(username) as { passwordHash: string; enabled: number } | undefined;
  if (row) {
    if (!row.enabled) return { ok: false, error: '账号未启用，请等待管理员开通' };
    if (!checkPassword(password, row.passwordHash)) return { ok: false, error: '账号或密码不正确' };
    return { ok: true };
  }
  const expectedUser = process.env.ADMIN_USERNAME ?? '';
  const expectedPass = process.env.ADMIN_PASSWORD ?? '';
  if (!expectedUser || !expectedPass) return { ok: false, error: '服务器未配置管理员账号' };
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  if (!userOk || !passOk) return { ok: false, error: '账号或密码不正确' };
  return { ok: true };
}

export function listRoles(): AdminRole[] {
  ensureAccess();
  return (
    getDb()
      .prepare(
        `SELECT r.id, r.code, r.name, r.remark, r.builtIn,
                (SELECT COUNT(*) FROM admin_user_roles ur WHERE ur.roleId = r.id) AS userCount
         FROM admin_roles r
         ORDER BY r.builtIn DESC, r.id ASC`,
      )
      .all() as AdminRoleRow[]
  ).map((role) => ({
    ...role,
    builtIn: Boolean(role.builtIn),
    userCount: Number(role.userCount) || 0,
  }));
}

export function getRole(id: number): AdminRole | null {
  return listRoles().find((role) => role.id === id) ?? null;
}

export function roleMenuCodes(roleId: number): string[] {
  ensureAccess();
  const rows = getDb()
    .prepare(`SELECT code FROM admin_role_actions WHERE roleId = ? ORDER BY code`)
    .all(roleId) as Array<{ code: string }>;
  return rows.map((row) => row.code);
}

export function createRole(name: string, remark: string): number {
  ensureAccess();
  const title = name.trim();
  if (!title || title.length > 32) throw new TableError('角色名称需为 1–32 个字');
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO admin_roles (code, name, remark, builtIn) VALUES ('pending', ?, ?, 0)`,
    )
    .run(title, remark.trim().slice(0, 200));
  const id = Number(inserted.lastInsertRowid);
  db.prepare(`UPDATE admin_roles SET code = ? WHERE id = ?`).run(`role_${id}`, id);
  return id;
}

export function updateRole(id: number, name: string, remark: string): void {
  ensureAccess();
  const title = name.trim();
  if (!title || title.length > 32) throw new TableError('角色名称需为 1–32 个字');
  const result = getDb()
    .prepare(`UPDATE admin_roles SET name = ?, remark = ?, updatedAt = datetime('now') WHERE id = ?`)
    .run(title, remark.trim().slice(0, 200), id);
  if (result.changes === 0) throw new TableError('角色不存在');
}

export function deleteRole(id: number): void {
  ensureAccess();
  const role = getRole(id);
  if (!role) throw new TableError('角色不存在');
  if (role.builtIn) throw new TableError('内置角色不能删除');
  if (role.userCount > 0) throw new TableError('仍有管理员使用该角色');
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM admin_role_menus WHERE roleId = ?`).run(id);
    db.prepare(`DELETE FROM admin_role_actions WHERE roleId = ?`).run(id);
    db.prepare(`DELETE FROM admin_user_roles WHERE roleId = ?`).run(id);
    db.prepare(`DELETE FROM admin_roles WHERE id = ?`).run(id);
  });
  run();
}

export function setRoleMenus(roleId: number, codes: string[]): void {
  ensureAccess();
  const role = getRole(roleId);
  if (!role) throw new TableError('角色不存在');
  if (role.code === 'super') throw new TableError('超级管理员固定拥有全部操作');
  const allowed = new Set(
    [...leafCodes()].flatMap((menu) => menuActions(menu).map((action) => actionPermission(menu, action.code))),
  );
  const unique = [...new Set(codes.filter((code) => allowed.has(code)))];
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM admin_role_actions WHERE roleId = ?`).run(roleId);
    db.prepare(`DELETE FROM admin_role_menus WHERE roleId = ?`).run(roleId);
    const insert = db.prepare(`INSERT INTO admin_role_actions (roleId, code) VALUES (?, ?)`);
    for (const code of unique) insert.run(roleId, code);
  });
  run();
}

export function listAdminUsers(): AdminAccount[] {
  ensureAccess();
  return (
    getDb()
      .prepare(
        `SELECT u.id, u.username, u.enabled,
                COALESCE(GROUP_CONCAT(r.name, '、'), '') AS roleName
         FROM admin_users u
         LEFT JOIN admin_user_roles ur ON ur.userId = u.id
         LEFT JOIN admin_roles r ON r.id = ur.roleId
         GROUP BY u.id
         ORDER BY u.id ASC`,
      )
      .all() as Array<{ id: number; username: string; enabled: number; roleName: string }>
  ).map((user) => ({
    id: user.id,
    username: user.username,
    enabled: Boolean(user.enabled),
    roleName: user.roleName,
    roleIds: roleIdsOf(user.id),
  }));
}

function roleIdsOf(userId: number): number[] {
  const rows = getDb()
    .prepare(`SELECT roleId FROM admin_user_roles WHERE userId = ? ORDER BY roleId`)
    .all(userId) as Array<{ roleId: number }>;
  return rows.map((row) => row.roleId);
}

export function getAdminUser(id: number): AdminAccount | null {
  return listAdminUsers().find((user) => user.id === id) ?? null;
}

function assertUsername(username: string): string {
  const name = username.trim();
  if (!USERNAME.test(name)) throw new TableError('账号需以字母开头，3–32 位字母、数字或下划线');
  if (name === (process.env.ADMIN_USERNAME ?? '')) {
    throw new TableError('该账号是环境变量中的超级管理员，不能重复创建');
  }
  return name;
}

function assertPassword(password: string): string {
  if (password.length < 6 || password.length > 64) throw new TableError('密码需为 6–64 位');
  return password;
}

function assertRoleIds(roleIds: number[]): number[] {
  const unique = [...new Set(roleIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) throw new TableError('请至少选择一个角色');
  for (const roleId of unique) {
    if (!getRole(roleId)) throw new TableError('角色不存在');
  }
  return unique;
}

function replaceUserRoles(userId: number, roleIds: number[]): void {
  const db = getDb();
  db.prepare(`DELETE FROM admin_user_roles WHERE userId = ?`).run(userId);
  const insert = db.prepare(`INSERT INTO admin_user_roles (userId, roleId) VALUES (?, ?)`);
  for (const roleId of roleIds) insert.run(userId, roleId);
}

export function registerAdminUser(username: string, password: string): void {
  ensureAccess();
  const name = assertUsername(username);
  const secret = assertPassword(password);
  const taken = getDb().prepare(`SELECT id FROM admin_users WHERE username = ?`).get(name);
  if (taken) throw new TableError('账号已存在');
  getDb()
    .prepare(`INSERT INTO admin_users (username, passwordHash, enabled) VALUES (?, ?, 0)`)
    .run(name, hashPassword(secret));
}

export function createAdminUser(input: {
  username: string;
  password: string;
  roleIds: number[];
  enabled: boolean;
}): void {
  ensureAccess();
  const username = assertUsername(input.username);
  const password = assertPassword(input.password);
  const roleIds = assertRoleIds(input.roleIds);
  const db = getDb();
  const run = db.transaction(() => {
    const inserted = db
      .prepare(`INSERT INTO admin_users (username, passwordHash, enabled) VALUES (?, ?, ?)`)
      .run(username, hashPassword(password), input.enabled ? 1 : 0);
    replaceUserRoles(Number(inserted.lastInsertRowid), roleIds);
  });
  run();
}

export function updateAdminUser(input: {
  id: number;
  password: string;
  roleIds: number[];
  enabled: boolean;
}): void {
  ensureAccess();
  const current = getAdminUser(input.id);
  if (!current) throw new TableError('管理员不存在');
  const roleIds = assertRoleIds(input.roleIds);
  const enabled = input.enabled ? 1 : 0;
  const db = getDb();
  const run = db.transaction(() => {
    if (input.password) {
      db.prepare(
        `UPDATE admin_users
         SET passwordHash = ?, enabled = ?, updatedAt = datetime('now')
         WHERE id = ?`,
      ).run(hashPassword(assertPassword(input.password)), enabled, input.id);
    } else {
      db.prepare(
        `UPDATE admin_users SET enabled = ?, updatedAt = datetime('now') WHERE id = ?`,
      ).run(enabled, input.id);
    }
    replaceUserRoles(input.id, roleIds);
  });
  run();
}

export type AdminMenu = {
  id: number;
  code: string;
  name: string;
  href: string;
  parentId: number | null;
  parentName: string;
  sort: number;
  enabled: boolean;
  builtIn: boolean;
};

type AdminMenuRow = {
  id: number;
  code: string;
  name: string;
  href: string;
  parentId: number | null;
  sort: number;
  enabled: number;
};

const MENU_CODE = /^[a-z][a-z0-9_:-]{1,63}$/;
const MENU_HREF = /^\/[A-Za-z0-9/_-]*$/;

function menuRows(): AdminMenuRow[] {
  return getDb()
    .prepare(
      `SELECT id, code, name, href, parentId, sort, enabled
       FROM admin_menus
       ORDER BY sort ASC, id ASC`,
    )
    .all() as AdminMenuRow[];
}

function isBuiltInMenu(code: string): boolean {
  return !code.startsWith('menu_');
}

export function listAdminMenus(): AdminMenu[] {
  ensureAccess();
  const rows = menuRows();
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    href: row.href,
    parentId: row.parentId,
    parentName: row.parentId ? (names.get(row.parentId) ?? '') : '',
    sort: row.sort,
    enabled: Boolean(row.enabled),
    builtIn: isBuiltInMenu(row.code),
  }));
}

export function getAdminMenu(id: number): AdminMenu | null {
  return listAdminMenus().find((menu) => menu.id === id) ?? null;
}

export function menuTreeFromDb(): MenuNode[] {
  const rows = listAdminMenus().filter((menu) => menu.enabled);
  const childrenOf = new Map<number, AdminMenu[]>();
  const roots: AdminMenu[] = [];
  const ids = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    if (row.parentId && ids.has(row.parentId)) {
      const list = childrenOf.get(row.parentId) ?? [];
      list.push(row);
      childrenOf.set(row.parentId, list);
      continue;
    }
    roots.push(row);
  }
  const tree: MenuNode[] = [];
  for (const row of roots) {
    const children = childrenOf.get(row.id) ?? [];
    if (children.length > 0) {
      tree.push({
        code: row.code,
        label: row.name,
        children: children
          .filter((child) => child.href)
          .map((child) => ({
            code: child.code,
            label: child.name,
            href: child.href,
            actions: menuActions(child.code),
          })),
      });
      continue;
    }
    if (row.href) {
      tree.push({
        code: row.code,
        label: row.name,
        href: row.href,
        actions: menuActions(row.code),
      });
    }
  }
  return tree;
}

function assertMenuName(name: string): string {
  const title = name.trim();
  if (!title || title.length > 32) throw new TableError('菜单名称需为 1–32 个字');
  return title;
}

function assertMenuHref(href: string, group: boolean): string {
  const value = href.trim();
  if (group) return '';
  if (!value || value.length > 200 || !MENU_HREF.test(value)) {
    throw new TableError('路径需以 / 开头，只含字母、数字、下划线、中划线和斜杠');
  }
  return value;
}

function assertMenuParent(parentId: number | null, selfId?: number): number | null {
  if (!parentId) return null;
  const parent = getAdminMenu(parentId);
  if (!parent) throw new TableError('上级菜单不存在');
  if (parent.href) throw new TableError('只能挂到分组菜单下');
  if (selfId && parent.id === selfId) throw new TableError('不能选择自己作为上级');
  return parent.id;
}

export function createAdminMenu(input: {
  name: string;
  href: string;
  parentId: number | null;
  sort: number;
  enabled: boolean;
  group: boolean;
}): void {
  ensureAccess();
  const name = assertMenuName(input.name);
  const href = assertMenuHref(input.href, input.group);
  const parentId = assertMenuParent(input.group ? null : input.parentId);
  const sort = Number.isInteger(input.sort) ? input.sort : 0;
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO admin_menus (code, name, href, parentId, sort, enabled)
       VALUES ('pending', ?, ?, ?, ?, ?)`,
    )
    .run(name, href, parentId, sort, input.enabled ? 1 : 0);
  const id = Number(inserted.lastInsertRowid);
  const code = `menu_${id}`;
  if (!MENU_CODE.test(code)) throw new TableError('菜单编码无效');
  db.prepare(`UPDATE admin_menus SET code = ? WHERE id = ?`).run(code, id);
}

export function updateAdminMenu(input: {
  id: number;
  name: string;
  href: string;
  parentId: number | null;
  sort: number;
  enabled: boolean;
}): void {
  ensureAccess();
  const current = getAdminMenu(input.id);
  if (!current) throw new TableError('菜单不存在');
  const name = assertMenuName(input.name);
  const group = !current.href && listAdminMenus().some((menu) => menu.parentId === current.id);
  const href = current.builtIn ? current.href : assertMenuHref(input.href, group || !input.href);
  const parentId = group ? null : assertMenuParent(input.parentId, current.id);
  if (parentId) {
    const child = listAdminMenus().some((menu) => menu.parentId === current.id);
    if (child) throw new TableError('已有下级菜单，不能再挂到其他菜单下');
  }
  const sort = Number.isInteger(input.sort) ? input.sort : current.sort;
  const result = getDb()
    .prepare(
      `UPDATE admin_menus
       SET name = ?, href = ?, parentId = ?, sort = ?, enabled = ?, updatedAt = datetime('now')
       WHERE id = ?`,
    )
    .run(name, href, parentId, sort, input.enabled ? 1 : 0, current.id);
  if (result.changes === 0) throw new TableError('菜单不存在');
}

export function deleteAdminMenu(id: number): void {
  ensureAccess();
  const current = getAdminMenu(id);
  if (!current) throw new TableError('菜单不存在');
  if (current.builtIn) throw new TableError('系统菜单不能删除，可以停用');
  if (listAdminMenus().some((menu) => menu.parentId === id)) {
    throw new TableError('请先删除下级菜单');
  }
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM admin_role_menus WHERE menuId = ?`).run(id);
    db.prepare(`DELETE FROM admin_menus WHERE id = ?`).run(id);
  });
  run();
}

export function deleteAdminUser(id: number): void {
  ensureAccess();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM admin_user_roles WHERE userId = ?`).run(id);
    const result = db.prepare(`DELETE FROM admin_users WHERE id = ?`).run(id);
    if (result.changes === 0) throw new TableError('管理员不存在');
  });
  run();
}
