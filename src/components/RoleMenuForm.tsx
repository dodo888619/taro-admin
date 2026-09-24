'use client';

import { useState } from 'react';
import { saveRoleMenusAction } from '@/lib/actions';
import { permissionCodes, type MenuNode } from '@/lib/menus';

function toggleCodes(current: Set<string>, codes: string[], on: boolean): Set<string> {
  const next = new Set(current);
  for (const code of codes) {
    if (on) next.add(code);
    else next.delete(code);
  }
  return next;
}

export function RoleMenuForm({
  roleId,
  tree,
  granted,
  locked,
}: {
  roleId: number;
  tree: MenuNode[];
  granted: string[];
  locked: boolean;
}) {
  const [selected, setSelected] = useState(() => new Set(granted));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(code: string) {
    setSelected((current) => toggleCodes(current, [code], !current.has(code)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveRoleMenusAction(roleId, [...selected]);
    if (result?.error) {
      setPending(false);
      setError(result.error);
      return;
    }
    window.location.assign(`/access/roles/${roleId}?saved=1`);
  }

  function renderLeaf(node: MenuNode) {
    const codes = permissionCodes(node);
    const allOn = codes.length > 0 && codes.every((code) => selected.has(code));
    return (
      <fieldset key={node.code} className="menu-group">
        <label className="check">
          <input
            type="checkbox"
            checked={locked || allOn}
            disabled={locked}
            onChange={() => setSelected((current) => toggleCodes(current, codes, !allOn))}
          />
          <span>{node.label}</span>
        </label>
        <div className="menu-children">
          {(node.actions ?? []).map((action) => {
            const code = `${node.code}:${action.code}`;
            return (
              <label key={code} className="check">
                <input
                  type="checkbox"
                  checked={locked || selected.has(code)}
                  disabled={locked}
                  onChange={() => toggle(code)}
                />
                <span>{action.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {locked ? <p className="note">超级管理员固定拥有全部操作。</p> : null}
      <div className="menu-tree">
        {tree.map((node) => {
          if (!node.children) return renderLeaf(node);
          const codes = permissionCodes(node);
          const allOn = codes.length > 0 && codes.every((code) => selected.has(code));
          return (
            <fieldset key={node.code} className="menu-group">
              <label className="check">
                <input
                  type="checkbox"
                  checked={locked || allOn}
                  disabled={locked}
                  onChange={() => setSelected((current) => toggleCodes(current, codes, !allOn))}
                />
                <span>{node.label}</span>
              </label>
              <div className="menu-actions">{node.children.map((child) => renderLeaf(child))}</div>
            </fieldset>
          );
        })}
      </div>
      {locked ? null : (
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? '保存中…' : '保存操作权限'}
          </button>
        </div>
      )}
    </form>
  );
}
