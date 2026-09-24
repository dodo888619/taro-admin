import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const session = await readSession();
  if (session) redirect('/');
  return (
    <main className="login-screen">
      <section className="card login-card">
        <div className="brand">
          <span className="mark">投</span>
          <span>
            <strong>投投管理</strong>
            <small>使用管理员账号登录</small>
          </span>
        </div>
        <LoginForm registered={Boolean((await searchParams).registered)} />
      </section>
    </main>
  );
}
