'use client';

import { useState } from 'react';

export function ImageUrlField({
  name,
  value,
  required,
  maxLength,
  folder,
}: {
  name: string;
  value: string;
  required: boolean;
  maxLength: number | null;
  folder: string;
}) {
  const [url, setUrl] = useState(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('folder', folder);
      const response = await fetch('/api/uploads', { method: 'POST', body });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || '上传失败');
      }
      setUrl(payload.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="image-url-field">
      <input type="hidden" name={name} value={url} required={required && !url} />
      {url ? (
        <div className="image-url-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" />
          <button className="btn btn-tiny" type="button" onClick={() => setUrl('')}>
            清除图片
          </button>
        </div>
      ) : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onPick}
        disabled={uploading}
      />
      <input
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="或粘贴图片 URL"
        maxLength={maxLength ?? undefined}
      />
      {uploading ? <p className="hint">上传中…</p> : null}
      {error ? <p className="alert alert-error">{error}</p> : null}
    </div>
  );
}
