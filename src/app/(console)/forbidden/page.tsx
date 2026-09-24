export const metadata = { title: '没有权限' };

export default function ForbiddenPage() {
  return (
    <div className="card">
      <h1>没有权限</h1>
      <p style={{ marginTop: 8 }}>当前角色不能执行这个操作。</p>
    </div>
  );
}
