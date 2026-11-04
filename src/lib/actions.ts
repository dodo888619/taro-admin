'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  canAccess,
  createAdminMenu,
  createAdminUser,
  createRole,
  registerAdminUser,
  deleteAdminMenu,
  deleteAdminUser,
  deleteRole,
  setRoleMenus,
  updateAdminMenu,
  updateAdminUser,
  updateRole,
} from './access';
import {
  clearSession,
  createSession,
  requireAdmin,
  verifyCredentials,
} from './auth';
import { publicError } from './errors';
import { actionPermission } from './menus';
import { shipPendingOrder } from './orders';
import { withNotice } from './paths';
import { saveProductRecord, type ProductInput } from './products';
import { tableAllowsCreate } from './schema';
import { removeRow, saveRow } from './tables';

export type FormState = { error: string } | null;

function refreshMall() {
  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath('/orders/ship-review');
  revalidatePath('/tables', 'layout');
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const result = await verifyCredentials(username, password);
  if (!result.ok) return { error: result.error };
  await createSession(username);
  redirect('/');
}

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) return { error: '两次输入的密码不一致' };
  try {
    await registerAdminUser(String(formData.get('username') ?? ''), password);
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect('/login?registered=1');
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}

async function guardMenu(code: string) {
  const access = await requireAdmin();
  if (!canAccess(access, code)) redirect('/forbidden');
  return access;
}

export async function saveProduct(
  input: ProductInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const access = await requireAdmin();
  const code = input.id ? actionPermission('product:list', 'update') : actionPermission('product:new', 'create');
  if (!canAccess(access, code)) return { ok: false, error: '没有权限' };
  try {
    const id = await saveProductRecord(input);
    refreshMall();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}

export async function saveRowAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const table = String(formData.get('table') ?? '');
  const pk = String(formData.get('pk') ?? '');
  if (!pk && !tableAllowsCreate(table)) {
    const errors: Record<string, string> = {
      orders: '订单不能在后台新增',
      users: '用户不能在后台新增',
      product_skus: '规格请在发布/编辑商品里添加',
    };
    return { error: errors[table] ?? '该表不能在后台新增' };
  }
  if (table === 'products') {
    await guardMenu(
      pk ? actionPermission('product:list', 'update') : actionPermission('product:new', 'create'),
    );
  } else {
    await guardMenu(actionPermission(`table:${table}`, pk ? 'update' : 'create'));
  }
  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string' || key === 'table' || key === 'pk') continue;
    input[key] = value;
  }
  try {
    await saveRow(table, pk, input);
    refreshMall();
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect(`/tables/${encodeURIComponent(table)}?saved=1`);
}

export async function deleteRowAction(formData: FormData): Promise<void> {
  const table = String(formData.get('table') ?? '');
  if (table === 'products') {
    await guardMenu(actionPermission('product:list', 'update'));
  } else {
    await guardMenu(actionPermission(`table:${table}`, 'delete'));
  }
  const pk = String(formData.get('pk') ?? '');
  try {
    await removeRow(table, pk);
    refreshMall();
  } catch (error) {
    redirect(
      withNotice(
        `/tables/${encodeURIComponent(table)}`,
        'error',
        publicError(error),
      ),
    );
  }
  redirect(`/tables/${encodeURIComponent(table)}?saved=1`);
}

export async function shipOrder(formData: FormData): Promise<void> {
  const access = await requireAdmin();
  const allowed =
    canAccess(access, actionPermission('order:ship-review', 'ship')) ||
    canAccess(access, actionPermission('table:orders', 'ship'));
  if (!allowed) redirect('/forbidden');

  const back = String(formData.get('back') ?? '/orders/ship-review');
  try {
    await shipPendingOrder(Number(formData.get('id')));
    refreshMall();
  } catch (error) {
    redirect(withNotice(back, 'error', publicError(error)));
  }
  redirect(withNotice(back, 'saved', '1'));
}

function refreshAccess() {
  revalidatePath('/access', 'layout');
}

export async function saveRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id') ?? 0);
  await guardMenu(actionPermission('access:roles', id ? 'update' : 'create'));
  try {
    if (id) await updateRole(id, String(formData.get('name') ?? ''), String(formData.get('remark') ?? ''));
    else await createRole(String(formData.get('name') ?? ''), String(formData.get('remark') ?? ''));
    refreshAccess();
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect('/access/roles?saved=1');
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  await guardMenu(actionPermission('access:roles', 'delete'));
  try {
    await deleteRole(Number(formData.get('id')));
    refreshAccess();
  } catch (error) {
    redirect(withNotice('/access/roles', 'error', publicError(error)));
  }
  redirect('/access/roles?saved=1');
}

export async function saveRoleMenusAction(roleId: number, codes: string[]): Promise<FormState> {
  await guardMenu(actionPermission('access:roles', 'update'));
  try {
    await setRoleMenus(roleId, codes);
    refreshAccess();
  } catch (error) {
    return { error: publicError(error) };
  }
  return null;
}

export async function saveAdminUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id') ?? 0);
  await guardMenu(actionPermission('access:users', id ? 'update' : 'create'));
  const roleIds = formData.getAll('roleId').map((value) => Number(value));
  const enabled = String(formData.get('enabled') ?? '1') === '1';
  const password = String(formData.get('password') ?? '');
  try {
    if (id) await updateAdminUser({ id, password, roleIds, enabled });
    else {
      await createAdminUser({
        username: String(formData.get('username') ?? ''),
        password,
        roleIds,
        enabled,
      });
    }
    refreshAccess();
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect('/access/users?saved=1');
}

function menuInput(formData: FormData) {
  const parent = Number(formData.get('parentId') ?? 0);
  const sort = Number(formData.get('sort') ?? 0);
  return {
    name: String(formData.get('name') ?? ''),
    href: String(formData.get('href') ?? ''),
    parentId: parent > 0 ? parent : null,
    sort: Number.isFinite(sort) ? Math.trunc(sort) : 0,
    enabled: String(formData.get('enabled') ?? '1') === '1',
    group: String(formData.get('group') ?? '') === '1',
  };
}

export async function saveAdminMenuAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id') ?? 0);
  await guardMenu(actionPermission('access:menus', id ? 'update' : 'create'));
  const input = menuInput(formData);
  try {
    if (id) {
      await updateAdminMenu({
        id,
        name: input.name,
        href: input.href,
        parentId: input.parentId,
        sort: input.sort,
        enabled: input.enabled,
      });
    } else await createAdminMenu(input);
    refreshAccess();
  } catch (error) {
    return { error: publicError(error) };
  }
  redirect('/access/menus?saved=1');
}

export async function deleteAdminMenuAction(formData: FormData): Promise<void> {
  await guardMenu(actionPermission('access:menus', 'delete'));
  try {
    await deleteAdminMenu(Number(formData.get('id')));
    refreshAccess();
  } catch (error) {
    redirect(withNotice('/access/menus', 'error', publicError(error)));
  }
  redirect('/access/menus?saved=1');
}

export async function deleteAdminUserAction(formData: FormData): Promise<void> {
  await guardMenu(actionPermission('access:users', 'delete'));
  try {
    await deleteAdminUser(Number(formData.get('id')));
    refreshAccess();
  } catch (error) {
    redirect(withNotice('/access/users', 'error', publicError(error)));
  }
  redirect('/access/users?saved=1');
}
