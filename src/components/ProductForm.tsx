'use client';

import { useState } from 'react';
import { saveProduct } from '@/lib/actions';
import type { CategoryOption, ProductFormValue, ProductImageValue, SpecGroup } from '@/lib/products';

type DraftSku = {
  id?: number;
  code: string;
  name: string;
  stock: string;
  sort: string;
  enabled: boolean;
  locked: number;
};

function toDraft(product?: ProductFormValue): DraftSku[] {
  if (!product || product.skus.length === 0) {
    return [{ code: '', name: '', stock: '0', sort: '0', enabled: true, locked: 0 }];
  }
  return product.skus.map((sku) => ({
    id: sku.id,
    code: sku.code,
    name: sku.name,
    stock: String(sku.stock),
    sort: String(sku.sort),
    enabled: sku.enabled,
    locked: sku.locked,
  }));
}

export function ProductForm({
  categories,
  initial,
  canSave = true,
}: {
  categories: CategoryOption[];
  initial?: ProductFormValue;
  canSave?: boolean;
}) {
  const [skus, setSkus] = useState<DraftSku[]>(() => toDraft(initial));
  const [images, setImages] = useState<ProductImageValue[]>(() => initial?.images ?? []);
  const [specs, setSpecs] = useState<SpecGroup[]>(() => initial?.specs ?? []);
  const [introImages, setIntroImages] = useState<ProductImageValue[]>(() => initial?.introImages ?? []);
  const [uploading, setUploading] = useState(false);
  const [createCategory, setCreateCategory] = useState(categories.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function patchSku(index: number, patch: Partial<DraftSku>) {
    setSkus((current) =>
      current.map((sku, skuIndex) => (skuIndex === index ? { ...sku, ...patch } : sku)),
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await saveProduct({
      id: initial?.id,
      name: String(form.get('name') ?? ''),
      points: String(form.get('points') ?? ''),
      price: String(form.get('price') ?? ''),
      cover: String(form.get('cover') ?? ''),
      images: images.map((image) => ({ stored: image.stored, list: image.list })),
      specs,
      introImages: introImages.map((image) => ({ stored: image.stored })),
      categoryId: String(form.get('categoryId') ?? ''),
      newCategoryName: createCategory ? String(form.get('newCategoryName') ?? '') : '',
      tips: String(form.get('tips') ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      enabled: String(form.get('enabled') ?? '1') === '1',
      skus: skus.map((sku) => ({
        id: sku.id,
        name: sku.name,
        stock: sku.stock,
        sort: sku.sort,
        enabled: sku.enabled,
      })),
    });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    window.location.assign(`/products/${result.id}?saved=1`);
  }

  async function uploadFiles(files: File[]): Promise<ProductImageValue[]> {
    const uploaded: ProductImageValue[] = [];
    for (const file of files) {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/uploads', { method: 'POST', body });
      const payload = (await response.json()) as { stored?: string; url?: string; error?: string };
      if (!response.ok || !payload.stored || !payload.url) {
        throw new Error(payload.error || '上传失败');
      }
      uploaded.push({ stored: payload.stored, url: payload.url, list: false });
    }
    return uploaded;
  }

  async function onPickImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFiles(files);
      setImages((current) => {
        const next = [...current, ...uploaded].slice(0, 9);
        if (next.length > 0 && !next.some((image) => image.list)) next[0] = { ...next[0], list: true };
        return next;
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      {error ? <p className="alert alert-error">{error}</p> : null}
      <div className="form-grid">
        <label className="field field-wide">
          <span>商品名称</span>
          <input name="name" required maxLength={128} defaultValue={initial?.name ?? ''} />
        </label>
        <label className="field">
          <span>兑换积分</span>
          <input name="points" required inputMode="numeric" defaultValue={initial?.points ?? ''} />
        </label>
        <label className="field">
          <span>展示价格（元）</span>
          <input name="price" required defaultValue={initial?.price ?? '0.00'} />
        </label>
        <div className="field field-wide">
          <span>图集</span>
          <div className="gallery">
            {images.map((image) => (
              <div key={image.stored} className={image.list ? 'gallery-item gallery-item-list' : 'gallery-item'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" />
                <label className="check">
                  <input
                    type="radio"
                    name="listImage"
                    checked={image.list}
                    onChange={() =>
                      setImages((current) => current.map((item) => ({ ...item, list: item.stored === image.stored })))
                    }
                  />
                  <span>列表图</span>
                </label>
                <button
                  className="btn btn-tiny"
                  type="button"
                  onClick={() =>
                    setImages((current) => {
                      const next = current.filter((item) => item.stored !== image.stored);
                      if (next.length > 0 && !next.some((item) => item.list)) next[0] = { ...next[0], list: true };
                      return next;
                    })
                  }
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onPickImages} />
          <p className="hint">上传到七牛云，最多 9 张。选一张作为商品列表展示图，其余显示在详情页封面位置。</p>
          {uploading ? <p className="hint">上传中…</p> : null}
        </div>
        <label className="field">
          <span>封面文案</span>
          <input name="cover" required maxLength={64} defaultValue={initial?.cover ?? ''} />
          <p className="hint">展示用短文案，不是图片地址，最长 64 字</p>
        </label>
        <div className="field">
          <span>分类</span>
          {createCategory ? (
            <input name="newCategoryName" required maxLength={32} placeholder="新分类名称" />
          ) : (
            <select name="categoryId" required defaultValue={initial ? String(initial.categoryId) : ''}>
              <option value="">请选择</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.enabled ? '' : '（已停用）'}
                </option>
              ))}
            </select>
          )}
          {categories.length > 0 ? (
            <button className="btn btn-tiny" type="button" onClick={() => setCreateCategory((value) => !value)}>
              {createCategory ? '选择已有分类' : '新建分类'}
            </button>
          ) : null}
        </div>
        <label className="field">
          <span>上架</span>
          <select name="enabled" defaultValue={initial && !initial.enabled ? '0' : '1'}>
            <option value="1">是</option>
            <option value="0">否</option>
          </select>
        </label>
        {initial ? (
          <p className="field">
            <span>累计销量</span>
            <strong>{initial.sales}</strong>
            <span className="hint">销量由订单累计，这里不能改</span>
          </p>
        ) : null}
        <label className="field field-wide">
          <span>温馨提示</span>
          <textarea
            name="tips"
            rows={4}
            placeholder={'更多详情敬请咨询客服；\n实物商品请以各门店实物为准；'}
            defaultValue={initial?.tipsText ?? ''}
          />
          <p className="hint">一行一条，保存后写入商品的 tips 字段</p>
        </label>
        <div className="field field-wide">
          <span>规格参数</span>
          {specs.map((group, groupIndex) => (
            <div key={groupIndex} className="spec-group">
              <div className="sku-head">
                <input
                  value={group.title}
                  maxLength={32}
                  placeholder="分组，例如基本信息"
                  onChange={(event) =>
                    setSpecs((current) =>
                      current.map((item, index) =>
                        index === groupIndex ? { ...item, title: event.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  className="btn btn-tiny"
                  type="button"
                  onClick={() => setSpecs((current) => current.filter((_, index) => index !== groupIndex))}
                >
                  删除分组
                </button>
              </div>
              {group.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="spec-row">
                  <input
                    value={row.label}
                    maxLength={32}
                    placeholder="参数名"
                    onChange={(event) =>
                      setSpecs((current) =>
                        current.map((item, index) =>
                          index === groupIndex
                            ? {
                                ...item,
                                rows: item.rows.map((cell, cellIndex) =>
                                  cellIndex === rowIndex ? { ...cell, label: event.target.value } : cell,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    value={row.value}
                    maxLength={200}
                    placeholder="参数值"
                    onChange={(event) =>
                      setSpecs((current) =>
                        current.map((item, index) =>
                          index === groupIndex
                            ? {
                                ...item,
                                rows: item.rows.map((cell, cellIndex) =>
                                  cellIndex === rowIndex ? { ...cell, value: event.target.value } : cell,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    className="btn btn-tiny"
                    type="button"
                    onClick={() =>
                      setSpecs((current) =>
                        current.map((item, index) =>
                          index === groupIndex
                            ? { ...item, rows: item.rows.filter((_, cellIndex) => cellIndex !== rowIndex) }
                            : item,
                        ),
                      )
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <button
                className="btn btn-tiny"
                type="button"
                onClick={() =>
                  setSpecs((current) =>
                    current.map((item, index) =>
                      index === groupIndex ? { ...item, rows: [...item.rows, { label: '', value: '' }] } : item,
                    ),
                  )
                }
              >
                添加参数
              </button>
            </div>
          ))}
          <button
            className="btn btn-tiny"
            type="button"
            onClick={() => setSpecs((current) => [...current, { title: '', rows: [{ label: '', value: '' }] }])}
          >
            添加分组
          </button>
        </div>
        <div className="field field-wide">
          <span>商品介绍</span>
          <div className="gallery">
            {introImages.map((image) => (
              <div key={image.stored} className="gallery-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" />
                <button
                  className="btn btn-tiny"
                  type="button"
                  onClick={() => setIntroImages((current) => current.filter((item) => item.stored !== image.stored))}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length === 0) return;
              setUploading(true);
              setError(null);
              uploadFiles(files)
                .then((uploaded) => setIntroImages((current) => [...current, ...uploaded].slice(0, 30)))
                .catch((uploadError: unknown) =>
                  setError(uploadError instanceof Error ? uploadError.message : '上传失败'),
                )
                .finally(() => setUploading(false));
            }}
          />
          <p className="hint">详情里的商品介绍，按上传顺序整宽展示，最多 30 张。</p>
        </div>
      </div>

      <div className="sku-head" style={{ marginTop: 18 }}>
        <h2>规格与库存</h2>
        <button
          className="btn btn-tiny"
          type="button"
          onClick={() =>
            setSkus((current) => [
              ...current,
              { code: '', name: '', stock: '0', sort: String(current.length), enabled: true, locked: 0 },
            ])
          }
        >
          添加规格
        </button>
      </div>
      <div className="sku-list" style={{ marginTop: 10 }}>
        {skus.map((sku, index) => (
          <div className="sku-row" key={sku.id ?? `new-${index}`}>
            <label className="field">
              <span>规格编码</span>
              <p className="readonly">{sku.code || '保存后自动生成'}</p>
              <p className="hint">系统生成，不可编辑</p>
            </label>
            <label className="field">
              <span>规格名称</span>
              <input value={sku.name} required maxLength={64} onChange={(event) => patchSku(index, { name: event.target.value })} />
            </label>
            <label className="field">
              <span>可售库存</span>
              <input value={sku.stock} required inputMode="numeric" onChange={(event) => patchSku(index, { stock: event.target.value })} />
            </label>
            <label className="field">
              <span>排序</span>
              <input value={sku.sort} required inputMode="numeric" onChange={(event) => patchSku(index, { sort: event.target.value })} />
            </label>
            <label className="field">
              <span>启用</span>
              <select value={sku.enabled ? '1' : '0'} onChange={(event) => patchSku(index, { enabled: event.target.value === '1' })}>
                <option value="1">是</option>
                <option value="0">否</option>
              </select>
            </label>
            <div className="sku-meta">
              {sku.locked > 0 ? <span>锁定 {sku.locked}</span> : null}
              {skus.length > 1 && sku.locked === 0 ? (
                <button className="btn btn-tiny" type="button" onClick={() => setSkus((current) => current.filter((_, skuIndex) => skuIndex !== index))}>
                  移除
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {canSave ? (
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? '保存中…' : initial ? '保存修改' : '发布商品'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
