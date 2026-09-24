'use client';

import { useActionState } from 'react';
import { saveAdminMenuAction, saveAdminUserAction, saveRoleAction, type FormState } from '@/lib/actions';

export function RoleForm({
  id,
  name,
  remark,
}: {
  id?: number;
  name?: string;
  remark?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRoleAction, null);
  return (
    <form action={action} className="card">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <div className="form-grid">
        <label className="field">
          <span>角色名称</span>
          <input name="name" required maxLength={32} defaultValue={name ?? ''} />
        </label>
        <label className="field">
          <span>备注</span>
          <input name="remark" maxLength={200} defaultValue={remark ?? ''} />
        </label>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}

export function MenuForm({
  id,
  name,
  href,
  parentId,
  sort,
  enabled,
  builtIn,
  parents,
}: {
  id?: number;
  name?: string;
  href?: string;
  parentId?: number | null;
  sort?: number;
  enabled?: boolean;
  builtIn?: boolean;
  parents: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAdminMenuAction, null);
  const lockedHref = Boolean(builtIn);
  return (
    <form action={action} className="card">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <div className="form-grid">
        <label className="field">
          <span>名称</span>
          <input name="name" required maxLength={32} defaultValue={name ?? ''} />
        </label>
        <label className="field">
          <span>类型</span>
          {id ? (
            <p className="readonly">{href ? '菜单' : '分组'}</p>
          ) : (
            <select name="group" defaultValue="0">
              <option value="0">菜单</option>
              <option value="1">分组</option>
            </select>
          )}
        </label>
        <label className="field">
          <span>路径</span>
          <input name="href" defaultValue={href ?? ''} readOnly={lockedHref} placeholder="/access/menus" />
          {lockedHref ? <p className="hint">系统菜单的路径不能修改</p> : <p className="hint">分组可以留空</p>}
        </label>
        <label className="field">
          <span>上级</span>
          <select name="parentId" defaultValue={parentId ? String(parentId) : '0'}>
            <option value="0">无</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>排序</span>
          <input name="sort" type="number" defaultValue={sort ?? 0} />
        </label>
        <label className="field">
          <span>启用</span>
          <select name="enabled" defaultValue={enabled === false ? '0' : '1'}>
            <option value="1">是</option>
            <option value="0">否</option>
          </select>
        </label>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}

export function AdminUserForm({
  id,
  username,
  roleIds,
  enabled,
  roles,
}: {
  id?: number;
  username?: string;
  roleIds?: number[];
  enabled?: boolean;
  roles: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAdminUserAction, null);
  return (
    <form action={action} className="card">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <div className="form-grid">
        <label className="field">
          <span>账号</span>
          <input name="username" required defaultValue={username ?? ''} readOnly={Boolean(id)} />
        </label>
        <label className="field">
          <span>{id ? '新密码' : '密码'}</span>
          <input name="password" type="password" autoComplete="new-password" required={!id} />
          {id ? <p className="hint">留空则不修改密码</p> : null}
        </label>
        <div className="field field-wide">
          <span>角色</span>
          <div className="menu-children">
            {roles.map((role) => (
              <label key={role.id} className="check">
                <input
                  type="checkbox"
                  name="roleId"
                  value={role.id}
                  defaultChecked={roleIds?.includes(role.id) ?? false}
                />
                <span>{role.name}</span>
              </label>
            ))}
          </div>
          <p className="hint">可多选，权限取所有角色的菜单并集</p>
        </div>
        <label className="field">
          <span>启用</span>
          <select name="enabled" defaultValue={enabled === false ? '0' : '1'}>
            <option value="1">是</option>
            <option value="0">否</option>
          </select>
        </label>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
