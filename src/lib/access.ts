import 'server-only';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db, transaction, type Sql } from './db';
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

async function columnNames(table: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table,
  );
  return rows.map((row) => row.name);
}

async function syncMenus(): Promise<void> {
  const seeds = menuSeeds(await listTableNames());
  for (const seed of seeds) {
    await db.run(
      `INSERT INTO admin_menus (code, name, href, sort, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()) AS new
       ON DUPLICATE KEY UPDATE href = new.href, updatedAt = UTC_TIMESTAMP()`,
      seed.code,
      seed.name,
      seed.href,
      seed.sort,
    );
  }
  await db.run(
    `UPDATE admin_menus SET name = '系统管理', updatedAt = UTC_TIMESTAMP()
     WHERE code = 'group:access' AND name = '权限'`,
  );
  await db.run(
    `UPDATE admin_menus SET name = '工具', updatedAt = UTC_TIMESTAMP()
     WHERE code = 'group:system' AND name = '系统'`,
  );
  const ids = new Map(
    (await db.all<{ id: number; code: string }>('SELECT id, code FROM admin_menus')).map((row) => [
      row.code,
      row.id,
    ]),
  );
  for (const seed of seeds) {
    if (!seed.parentCode) continue;
    await db.run(
      'UPDATE admin_menus SET parentId = ? WHERE code = ? AND parentId IS NULL',
      ids.get(seed.parentCode) ?? null,
      seed.code,
    );
  }
  const codes = seeds.map((seed) => seed.code);
  if (codes.length > 0) {
    await db.run(
      `UPDATE admin_menus SET enabled = 0, updatedAt = UTC_TIMESTAMP()
       WHERE code NOT LIKE 'menu_%' AND code NOT IN (${codes.map(() => '?').join(',')})`,
      ...codes,
    );
  }
}

export async function ensureAccess(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_menus (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      href VARCHAR(255) NOT NULL DEFAULT '',
      parentId INT NULL,
      sort INT NOT NULL DEFAULT 0,
      enabled TINYINT NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY UQ_admin_menus_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      remark VARCHAR(255) NOT NULL DEFAULT '',
      builtIn TINYINT NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY UQ_admin_roles_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_user_roles (
      userId INT NOT NULL,
      roleId INT NOT NULL,
      PRIMARY KEY (userId, roleId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  if ((await columnNames('admin_users')).includes('roleId')) {
    await db.exec(`
      RENAME TABLE admin_users TO admin_users_old
    `);
    await db.exec(`
      CREATE TABLE admin_users (
        id INT NOT NULL AUTO_INCREMENT,
        username VARCHAR(64) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_admin_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.exec(`
      INSERT INTO admin_users (id, username, passwordHash, enabled, createdAt, updatedAt)
      SELECT id, username, passwordHash, enabled, createdAt, updatedAt FROM admin_users_old
    `);
    await db.exec(`
      INSERT IGNORE INTO admin_user_roles (userId, roleId)
      SELECT id, roleId FROM admin_users_old
    `);
    await db.exec('DROP TABLE admin_users_old');
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT NOT NULL AUTO_INCREMENT,
        username VARCHAR(64) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_admin_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }
  await syncMenus();
  if ((await columnNames('admin_role_menus')).includes('menuCode')) {
    await db.exec('RENAME TABLE admin_role_menus TO admin_role_menus_old');
    await db.exec(`
      CREATE TABLE admin_role_menus (
        roleId INT NOT NULL,
        menuId INT NOT NULL,
        PRIMARY KEY (roleId, menuId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.exec(`
      INSERT IGNORE INTO admin_role_menus (roleId, menuId)
      SELECT old.roleId, menu.id
      FROM admin_role_menus_old old
      JOIN admin_menus menu ON menu.code = old.menuCode
    `);
    await db.exec('DROP TABLE admin_role_menus_old');
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS admin_role_menus (
        roleId INT NOT NULL,
        menuId INT NOT NULL,
        PRIMARY KEY (roleId, menuId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }
  const existing = await db.get<{ id: number }>(`SELECT id FROM admin_roles WHERE code = 'super'`);
  const superId = existing
    ? existing.id
    : Number(
        (
          await db.run(
            `INSERT INTO admin_roles (code, name, remark, builtIn, createdAt, updatedAt)
             VALUES ('super', '超级管理员', '拥有全部菜单', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          )
        ).lastInsertRowid,
      );
  await db.run(
    `INSERT IGNORE INTO admin_role_menus (roleId, menuId)
     SELECT ?, id FROM admin_menus WHERE enabled = 1 AND href != ''`,
    superId,
  );
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_role_actions (
      roleId INT NOT NULL,
      code VARCHAR(128) NOT NULL,
      PRIMARY KEY (roleId, code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await migrateMenuGrants();
}

async function migrateMenuGrants(): Promise<void> {
  const roles = await db.all<{ roleId: number }>(
    `SELECT DISTINCT rm.roleId
     FROM admin_role_menus rm
     WHERE NOT EXISTS (SELECT 1 FROM admin_role_actions a WHERE a.roleId = rm.roleId)`,
  );
  for (const role of roles) {
    const rows = await db.all<{ code: string }>(
      `SELECT m.code FROM admin_role_menus rm
       JOIN admin_menus m ON m.id = rm.menuId
       WHERE rm.roleId = ?`,
      role.roleId,
    );
    for (const row of rows) {
      for (const action of menuActions(row.code)) {
        await db.run(
          'INSERT IGNORE INTO admin_role_actions (roleId, code) VALUES (?, ?)',
          role.roleId,
          actionPermission(row.code, action.code),
        );
      }
    }
    await db.run('DELETE FROM admin_role_menus WHERE roleId = ?', role.roleId);
  }
}

async function leafCodes(): Promise<Set<string>> {
  const rows = await db.all<{ code: string }>(
    `SELECT code FROM admin_menus WHERE enabled = 1 AND href != ''`,
  );
  return new Set(rows.map((row) => row.code));
}

export function canAccess(access: AdminAccess, code: string): boolean {
  if (access.super || access.menus.includes(code)) return true;
  const prefix = `${code}:`;
  return access.menus.some((item) => item.startsWith(prefix));
}

export async function loadAccess(username: string): Promise<AdminAccess | null> {
  await ensureAccess();
  if (username && username === (process.env.ADMIN_USERNAME ?? '')) {
    return { username, super: true, menus: [...(await leafCodes())] };
  }
  const row = await db.get<{ username: string; enabled: number }>(
    'SELECT username, enabled FROM admin_users WHERE username = ?',
    username,
  );
  if (!row || !row.enabled) return null;
  const roles = await db.all<{ code: string }>(
    `SELECT r.code
     FROM admin_roles r
     JOIN admin_user_roles ur ON ur.roleId = r.id
     JOIN admin_users u ON u.id = ur.userId
     WHERE u.username = ?`,
    username,
  );
  if (roles.some((role) => role.code === 'super')) {
    return { username: row.username, super: true, menus: [...(await leafCodes())] };
  }
  const menus = await db.all<{ code: string }>(
    `SELECT DISTINCT a.code
     FROM admin_role_actions a
     JOIN admin_user_roles ur ON ur.roleId = a.roleId
     JOIN admin_users u ON u.id = ur.userId
     WHERE u.username = ?`,
    username,
  );
  return { username: row.username, super: false, menus: menus.map((item) => item.code) };
}

export async function authenticate(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureAccess();
  const row = await db.get<{ passwordHash: string; enabled: number }>(
    'SELECT passwordHash, enabled FROM admin_users WHERE username = ?',
    username,
  );
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

export async function listRoles(): Promise<AdminRole[]> {
  await ensureAccess();
  const rows = await db.all<AdminRoleRow>(
    `SELECT r.id, r.code, r.name, r.remark, r.builtIn,
            (SELECT COUNT(*) FROM admin_user_roles ur WHERE ur.roleId = r.id) AS userCount
     FROM admin_roles r
     ORDER BY r.builtIn DESC, r.id ASC`,
  );
  return rows.map((role) => ({
    ...role,
    builtIn: Boolean(role.builtIn),
    userCount: Number(role.userCount) || 0,
  }));
}

export async function getRole(id: number): Promise<AdminRole | null> {
  return (await listRoles()).find((role) => role.id === id) ?? null;
}

export async function roleMenuCodes(roleId: number): Promise<string[]> {
  await ensureAccess();
  const rows = await db.all<{ code: string }>(
    'SELECT code FROM admin_role_actions WHERE roleId = ? ORDER BY code',
    roleId,
  );
  return rows.map((row) => row.code);
}

export async function createRole(name: string, remark: string): Promise<number> {
  await ensureAccess();
  const title = name.trim();
  if (!title || title.length > 32) throw new TableError('角色名称需为 1–32 个字');
  const inserted = await db.run(
    `INSERT INTO admin_roles (code, name, remark, builtIn, createdAt, updatedAt)
     VALUES ('pending', ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    title,
    remark.trim().slice(0, 200),
  );
  const id = Number(inserted.lastInsertRowid);
  await db.run('UPDATE admin_roles SET code = ? WHERE id = ?', `role_${id}`, id);
  return id;
}

export async function updateRole(id: number, name: string, remark: string): Promise<void> {
  await ensureAccess();
  const title = name.trim();
  if (!title || title.length > 32) throw new TableError('角色名称需为 1–32 个字');
  const result = await db.run(
    `UPDATE admin_roles SET name = ?, remark = ?, updatedAt = UTC_TIMESTAMP() WHERE id = ?`,
    title,
    remark.trim().slice(0, 200),
    id,
  );
  if (result.changes === 0) throw new TableError('角色不存在');
}

export async function deleteRole(id: number): Promise<void> {
  await ensureAccess();
  const role = await getRole(id);
  if (!role) throw new TableError('角色不存在');
  if (role.builtIn) throw new TableError('内置角色不能删除');
  if (role.userCount > 0) throw new TableError('仍有管理员使用该角色');
  await transaction(async (sql) => {
    await sql.run('DELETE FROM admin_role_menus WHERE roleId = ?', id);
    await sql.run('DELETE FROM admin_role_actions WHERE roleId = ?', id);
    await sql.run('DELETE FROM admin_user_roles WHERE roleId = ?', id);
    await sql.run('DELETE FROM admin_roles WHERE id = ?', id);
  });
}

export async function setRoleMenus(roleId: number, codes: string[]): Promise<void> {
  await ensureAccess();
  const role = await getRole(roleId);
  if (!role) throw new TableError('角色不存在');
  if (role.code === 'super') throw new TableError('超级管理员固定拥有全部操作');
  const allowed = new Set(
    [...(await leafCodes())].flatMap((menu) =>
      menuActions(menu).map((action) => actionPermission(menu, action.code)),
    ),
  );
  const unique = [...new Set(codes.filter((code) => allowed.has(code)))];
  await transaction(async (sql) => {
    await sql.run('DELETE FROM admin_role_actions WHERE roleId = ?', roleId);
    await sql.run('DELETE FROM admin_role_menus WHERE roleId = ?', roleId);
    for (const code of unique) {
      await sql.run('INSERT INTO admin_role_actions (roleId, code) VALUES (?, ?)', roleId, code);
    }
  });
}

export async function listAdminUsers(): Promise<AdminAccount[]> {
  await ensureAccess();
  const rows = await db.all<{ id: number; username: string; enabled: number; roleName: string }>(
    `SELECT u.id, u.username, u.enabled,
            COALESCE(GROUP_CONCAT(r.name SEPARATOR '、'), '') AS roleName
     FROM admin_users u
     LEFT JOIN admin_user_roles ur ON ur.userId = u.id
     LEFT JOIN admin_roles r ON r.id = ur.roleId
     GROUP BY u.id, u.username, u.enabled
     ORDER BY u.id ASC`,
  );
  return Promise.all(
    rows.map(async (user) => ({
      id: user.id,
      username: user.username,
      enabled: Boolean(user.enabled),
      roleName: user.roleName,
      roleIds: await roleIdsOf(user.id),
    })),
  );
}

async function roleIdsOf(userId: number): Promise<number[]> {
  const rows = await db.all<{ roleId: number }>(
    'SELECT roleId FROM admin_user_roles WHERE userId = ? ORDER BY roleId',
    userId,
  );
  return rows.map((row) => row.roleId);
}

export async function getAdminUser(id: number): Promise<AdminAccount | null> {
  return (await listAdminUsers()).find((user) => user.id === id) ?? null;
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

async function assertRoleIds(roleIds: number[]): Promise<number[]> {
  const unique = [...new Set(roleIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) throw new TableError('请至少选择一个角色');
  for (const roleId of unique) {
    if (!(await getRole(roleId))) throw new TableError('角色不存在');
  }
  return unique;
}

async function replaceUserRoles(sql: Sql, userId: number, roleIds: number[]): Promise<void> {
  await sql.run('DELETE FROM admin_user_roles WHERE userId = ?', userId);
  for (const roleId of roleIds) {
    await sql.run('INSERT INTO admin_user_roles (userId, roleId) VALUES (?, ?)', userId, roleId);
  }
}

export async function registerAdminUser(username: string, password: string): Promise<void> {
  await ensureAccess();
  const name = assertUsername(username);
  const secret = assertPassword(password);
  const taken = await db.get('SELECT id FROM admin_users WHERE username = ?', name);
  if (taken) throw new TableError('账号已存在');
  await db.run(
    `INSERT INTO admin_users (username, passwordHash, enabled, createdAt, updatedAt)
     VALUES (?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    name,
    hashPassword(secret),
  );
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  roleIds: number[];
  enabled: boolean;
}): Promise<void> {
  await ensureAccess();
  const username = assertUsername(input.username);
  const password = assertPassword(input.password);
  const roleIds = await assertRoleIds(input.roleIds);
  await transaction(async (sql) => {
    const inserted = await sql.run(
      `INSERT INTO admin_users (username, passwordHash, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      username,
      hashPassword(password),
      input.enabled ? 1 : 0,
    );
    await replaceUserRoles(sql, Number(inserted.lastInsertRowid), roleIds);
  });
}

export async function updateAdminUser(input: {
  id: number;
  password: string;
  roleIds: number[];
  enabled: boolean;
}): Promise<void> {
  await ensureAccess();
  const current = await getAdminUser(input.id);
  if (!current) throw new TableError('管理员不存在');
  const roleIds = await assertRoleIds(input.roleIds);
  const enabled = input.enabled ? 1 : 0;
  await transaction(async (sql) => {
    if (input.password) {
      await sql.run(
        `UPDATE admin_users
         SET passwordHash = ?, enabled = ?, updatedAt = UTC_TIMESTAMP()
         WHERE id = ?`,
        hashPassword(assertPassword(input.password)),
        enabled,
        input.id,
      );
    } else {
      await sql.run(
        'UPDATE admin_users SET enabled = ?, updatedAt = UTC_TIMESTAMP() WHERE id = ?',
        enabled,
        input.id,
      );
    }
    await replaceUserRoles(sql, input.id, roleIds);
  });
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

async function menuRows(): Promise<AdminMenuRow[]> {
  return db.all<AdminMenuRow>(
    `SELECT id, code, name, href, parentId, sort, enabled
     FROM admin_menus
     ORDER BY sort ASC, id ASC`,
  );
}

function isBuiltInMenu(code: string): boolean {
  return !code.startsWith('menu_');
}

export async function listAdminMenus(): Promise<AdminMenu[]> {
  await ensureAccess();
  const rows = await menuRows();
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

export async function getAdminMenu(id: number): Promise<AdminMenu | null> {
  return (await listAdminMenus()).find((menu) => menu.id === id) ?? null;
}

export async function menuTreeFromDb(): Promise<MenuNode[]> {
  const rows = (await listAdminMenus()).filter((menu) => menu.enabled);
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

async function assertMenuParent(parentId: number | null, selfId?: number): Promise<number | null> {
  if (!parentId) return null;
  const parent = await getAdminMenu(parentId);
  if (!parent) throw new TableError('上级菜单不存在');
  if (parent.href) throw new TableError('只能挂到分组菜单下');
  if (selfId && parent.id === selfId) throw new TableError('不能选择自己作为上级');
  return parent.id;
}

export async function createAdminMenu(input: {
  name: string;
  href: string;
  parentId: number | null;
  sort: number;
  enabled: boolean;
  group: boolean;
}): Promise<void> {
  await ensureAccess();
  const name = assertMenuName(input.name);
  const href = assertMenuHref(input.href, input.group);
  const parentId = await assertMenuParent(input.group ? null : input.parentId);
  const sort = Number.isInteger(input.sort) ? input.sort : 0;
  const inserted = await db.run(
    `INSERT INTO admin_menus (code, name, href, parentId, sort, enabled, createdAt, updatedAt)
     VALUES ('pending', ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    name,
    href,
    parentId,
    sort,
    input.enabled ? 1 : 0,
  );
  const id = Number(inserted.lastInsertRowid);
  const code = `menu_${id}`;
  if (!MENU_CODE.test(code)) throw new TableError('菜单编码无效');
  await db.run('UPDATE admin_menus SET code = ? WHERE id = ?', code, id);
}

export async function updateAdminMenu(input: {
  id: number;
  name: string;
  href: string;
  parentId: number | null;
  sort: number;
  enabled: boolean;
}): Promise<void> {
  await ensureAccess();
  const current = await getAdminMenu(input.id);
  if (!current) throw new TableError('菜单不存在');
  const name = assertMenuName(input.name);
  const menus = await listAdminMenus();
  const group = !current.href && menus.some((menu) => menu.parentId === current.id);
  const href = current.builtIn ? current.href : assertMenuHref(input.href, group || !input.href);
  const parentId = group ? null : await assertMenuParent(input.parentId, current.id);
  if (parentId && menus.some((menu) => menu.parentId === current.id)) {
    throw new TableError('已有下级菜单，不能再挂到其他菜单下');
  }
  const sort = Number.isInteger(input.sort) ? input.sort : current.sort;
  const result = await db.run(
    `UPDATE admin_menus
     SET name = ?, href = ?, parentId = ?, sort = ?, enabled = ?, updatedAt = UTC_TIMESTAMP()
     WHERE id = ?`,
    name,
    href,
    parentId,
    sort,
    input.enabled ? 1 : 0,
    current.id,
  );
  if (result.changes === 0) throw new TableError('菜单不存在');
}

export async function deleteAdminMenu(id: number): Promise<void> {
  await ensureAccess();
  const current = await getAdminMenu(id);
  if (!current) throw new TableError('菜单不存在');
  if (current.builtIn) throw new TableError('系统菜单不能删除，可以停用');
  if ((await listAdminMenus()).some((menu) => menu.parentId === id)) {
    throw new TableError('请先删除下级菜单');
  }
  await transaction(async (sql) => {
    await sql.run('DELETE FROM admin_role_menus WHERE menuId = ?', id);
    await sql.run('DELETE FROM admin_menus WHERE id = ?', id);
  });
}

export async function deleteAdminUser(id: number): Promise<void> {
  await ensureAccess();
  await transaction(async (sql) => {
    await sql.run('DELETE FROM admin_user_roles WHERE userId = ?', id);
    const result = await sql.run('DELETE FROM admin_users WHERE id = ?', id);
    if (result.changes === 0) throw new TableError('管理员不存在');
  });
}
