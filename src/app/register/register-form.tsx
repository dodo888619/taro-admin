'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction, type FormState } from '@/lib/actions';

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, null);
  return (
    <form action={action}>
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <label className="field">
        <span>账号</span>
        <input name="username" autoComplete="username" required />
        <p className="hint">字母开头，3–32 位字母、数字或下划线</p>
      </label>
      <label className="field">
        <span>密码</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={6} />
      </label>
      <label className="field">
        <span>确认密码</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={6} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? '提交中…' : '注册'}
      </button>
      <p className="hint">
        已有账号？<Link href="/login">登录</Link>
      </p>
    </form>
  );
}
