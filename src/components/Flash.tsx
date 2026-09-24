export function Flash({ saved, error }: { saved?: string; error?: string }) {
  if (error) return <p className="alert alert-error">{error}</p>;
  if (saved) return <p className="alert alert-ok">已保存</p>;
  return null;
}
