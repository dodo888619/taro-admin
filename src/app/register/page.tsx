import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await readSession();
  if (session) redirect('/');
  return (
    <main className="login-screen">
      <section className="card login-card">
        <div className="brand">
          <span className="mark">投</span>
          <span>
            <strong>注册管理员</strong>
            <small>提交后需超级管理员启用</small>
          </span>
        </div>
        <RegisterForm />
      </section>
    </main>
  );
}
