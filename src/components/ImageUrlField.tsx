'use client';

import { useState } from 'react';

export function ImageUrlField({
  name,
  value,
  previewUrl = '',
  required,
  maxLength,
  folder,
}: {
  name: string;
  /** 入库值：优先 qiniu:key，也兼容完整 http(s) URL */
  value: string;
  /** 预览用可访问 URL（后台已把 qiniu: 解析成 CDN） */
  previewUrl?: string;
  required: boolean;
  maxLength: number | null;
  folder: string;
}) {
  const [stored, setStored] = useState(value);
  const [preview, setPreview] = useState(
    previewUrl || (/^https?:\/\//i.test(value) ? value : ''),
  );
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
      const payload = (await response.json()) as {
        stored?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.stored || !payload.url) {
        throw new Error(payload.error || '上传失败');
      }
      // 入库存 qiniu:key（与商品图一致），预览用 HTTPS CDN
      setStored(payload.stored);
      setPreview(payload.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  const clear = () => {
    setStored('');
    setPreview('');
  };

  return (
    <div className="image-url-field">
      <input type="hidden" name={name} value={stored} required={required && !stored} />
      {preview ? (
        <div className="image-url-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" />
          <button className="btn btn-tiny" type="button" onClick={clear}>
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
        value={preview}
        onChange={(event) => {
          const next = event.target.value;
          setPreview(next);
          setStored(next);
        }}
        placeholder="或粘贴图片 URL"
        maxLength={maxLength ?? undefined}
      />
      {uploading ? <p className="hint">上传中…</p> : null}
      {error ? <p className="alert alert-error">{error}</p> : null}
    </div>
  );
}
