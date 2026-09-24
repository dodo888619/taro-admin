'use client';

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card">
      <h1>页面出错了</h1>
      <p style={{ marginTop: 8 }}>{error.message || '请稍后重试'}</p>
      <button className="btn btn-primary" type="button" style={{ marginTop: 16 }} onClick={reset}>
        重试
      </button>
    </div>
  );
}
