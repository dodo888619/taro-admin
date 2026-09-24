'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type FormState } from '@/lib/actions';

export function LoginForm({ registered }: { registered?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <form action={action}>
      {registered ? <p className="alert alert-ok">注册成功，请等待管理员启用后再登录</p> : null}
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <label className="field">
        <span>账号</span>
        <input name="username" autoComplete="username" required />
      </label>
      <label className="field">
        <span>密码</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? '登录中…' : '登录'}
      </button>
      <p className="hint">
        还没有账号？<Link href="/register">注册</Link>
      </p>
    </form>
  );
}
