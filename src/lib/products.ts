import 'server-only';
import { getDb } from './db';
import { TableError } from './errors';
import { publicImageUrl } from './qiniu';

export type CategoryOption = {
  id: number;
  name: string;
  enabled: boolean;
};

export type SkuFormValue = {
  id?: number;
  code: string;
  name: string;
  stock: number;
  sort: number;
  enabled: boolean;
  locked: number;
};

export type ProductImageValue = {
  stored: string;
  url: string;
  list: boolean;
};

export type SpecRow = {
  label: string;
  value: string;
};

export type SpecGroup = {
  title: string;
  rows: SpecRow[];
};

export type ProductFormValue = {
  id: number;
  name: string;
  points: number;
  price: string;
  cover: string;
  categoryId: number;
  sales: number;
  tipsText: string;
  enabled: boolean;
  images: ProductImageValue[];
  specs: SpecGroup[];
  introImages: ProductImageValue[];
  skus: SkuFormValue[];
};

export type ProductListItem = {
  id: number;
  name: string;
  points: number;
  price: string;
  cover: string;
  listImage: string;
  categoryName: string;
  sales: number;
  stock: number;
  enabled: boolean;
  skuCount: number;
};

export type ProductInput = {
  id?: number;
  name: string;
  points: string;
  price: string;
  cover: string;
  images: Array<{ stored: string; list: boolean }>;
  specs: SpecGroup[];
  introImages: Array<{ stored: string }>;
  categoryId: string;
  newCategoryName: string;
  tips: string[];
  enabled: boolean;
  skus: Array<{
    id?: number;
    code: string;
    name: string;
    stock: string;
    sort: string;
    enabled: boolean;
  }>;
};

type ProductRow = {
  id: number;
  name: string;
  points: number;
  price: string;
  cover: string;
  categoryId: number;
  sales: number;
  tips: string;
  enabled: number;
  specs: string;
  introImages: string;
};

type SkuRow = {
  id: number;
  code: string;
  name: string;
  stock: number;
  locked: number;
  sort: number;
  enabled: number;
};

function requireInt(raw: string, label: string, min: number): number {
  const text = raw.trim();
  if (!/^\d+$/.test(text) || Number(text) < min) {
    throw new TableError(`${label}须为不小于 ${min} 的整数`);
  }
  return Number(text);
}

function normalizePrice(raw: string): string {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new TableError('价格格式应为数字，最多两位小数，例如 0.00');
  }
  const [yuan, cent = ''] = text.split('.');
  return `${yuan}.${cent.padEnd(2, '0')}`;
}

function ensureProductColumns(): void {
  const names = new Set(
    (getDb().prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>).map((row) => row.name),
  );
  if (!names.has('specs')) {
    getDb().exec(`ALTER TABLE products ADD COLUMN specs TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!names.has('introImages')) {
    getDb().exec(`ALTER TABLE products ADD COLUMN introImages TEXT NOT NULL DEFAULT '[]'`);
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readSpecs(raw: string): SpecGroup[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((group) => {
    if (!group || typeof group !== 'object') return [];
    const record = group as { title?: unknown; rows?: unknown };
    const rows = Array.isArray(record.rows)
      ? record.rows.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const cell = row as { label?: unknown; value?: unknown };
          if (typeof cell.label !== 'string' || typeof cell.value !== 'string') return [];
          return [{ label: cell.label, value: cell.value }];
        })
      : [];
    return [{ title: typeof record.title === 'string' ? record.title : '', rows }];
  });
}

function readIntroImages(raw: string): ProductImageValue[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((stored) => {
    if (typeof stored !== 'string' || !stored) return [];
    return [{ stored, url: publicImageUrl(stored), list: false }];
  });
}

function ensureImageTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      url TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      isList INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS IDX_product_images_productId ON product_images (productId);
  `);
}

function tipsToText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join('\n');
  } catch {
    return raw;
  }
  return raw;
}

export function listCategories(): CategoryOption[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, enabled FROM product_categories ORDER BY sort ASC, id ASC`,
    )
    .all() as Array<{ id: number; name: string; enabled: number }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
  }));
}

type ProductListRow = {
  id: number;
  name: string;
  points: number;
  price: string;
  cover: string;
  sales: number;
  enabled: number;
  categoryName: string;
  stock: number;
  skuCount: number;
};

export function listProducts(): ProductListItem[] {
  ensureImageTable();
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name, p.points, p.price, p.cover, p.sales, p.enabled,
              COALESCE(c.name, '—') AS categoryName,
              COALESCE(SUM(s.stock), 0) AS stock,
              COUNT(s.id) AS skuCount
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.categoryId
       LEFT JOIN product_skus s ON s.productId = p.id
       GROUP BY p.id
       ORDER BY p.id DESC`,
    )
    .all() as ProductListRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    points: row.points,
    price: row.price,
    cover: row.cover,
    listImage: listImageOf(row.id),
    categoryName: row.categoryName,
    sales: row.sales,
    stock: Number(row.stock) || 0,
    enabled: Boolean(row.enabled),
    skuCount: Number(row.skuCount) || 0,
  }));
}

function listImageOf(productId: number): string {
  const row = getDb()
    .prepare(`SELECT url FROM product_images WHERE productId = ? AND isList = 1 ORDER BY sort ASC, id ASC LIMIT 1`)
    .get(productId) as { url: string } | undefined;
  return row ? publicImageUrl(row.url) : '';
}

function productImages(productId: number): ProductImageValue[] {
  const rows = getDb()
    .prepare(
      `SELECT url, isList FROM product_images WHERE productId = ? ORDER BY sort ASC, id ASC`,
    )
    .all(productId) as Array<{ url: string; isList: number }>;
  return rows.map((row) => ({
    stored: row.url,
    url: publicImageUrl(row.url),
    list: Boolean(row.isList),
  }));
}

export function getProduct(id: number): ProductFormValue | null {
  ensureImageTable();
  ensureProductColumns();
  const product = getDb()
    .prepare(
      `SELECT id, name, points, price, cover, categoryId, sales, tips, enabled, specs, introImages
       FROM products WHERE id = ?`,
    )
    .get(id) as ProductRow | undefined;
  if (!product) return null;
  const skus = getDb()
    .prepare(
      `SELECT id, code, name, stock, locked, sort, enabled
       FROM product_skus WHERE productId = ?
       ORDER BY sort ASC, id ASC`,
    )
    .all(id) as SkuRow[];
  return {
    id: product.id,
    name: product.name,
    points: product.points,
    price: product.price,
    cover: product.cover,
    categoryId: product.categoryId,
    sales: product.sales,
    tipsText: tipsToText(product.tips),
    enabled: Boolean(product.enabled),
    images: productImages(product.id),
    specs: readSpecs(product.specs),
    introImages: readIntroImages(product.introImages),
    skus: skus.map((sku) => ({
      id: sku.id,
      code: sku.code,
      name: sku.name,
      stock: sku.stock,
      sort: sku.sort,
      enabled: Boolean(sku.enabled),
      locked: sku.locked,
    })),
  };
}

function parseSkus(input: ProductInput['skus']) {
  if (input.length < 1 || input.length > 30) {
    throw new TableError('请至少填写 1 个规格，最多 30 个');
  }
  const seen = new Set<string>();
  return input.map((sku) => {
    const code = sku.code.trim();
    const name = sku.name.trim();
    if (!/^[\w.-]+$/.test(code) || code.length > 64) {
      throw new TableError('规格编码仅支持字母、数字、下划线、点、短横线，最长 64 位');
    }
    if (!name || name.length > 64) throw new TableError('规格名称需为 1–64 个字');
    if (seen.has(code)) throw new TableError(`规格编码 ${code} 重复`);
    seen.add(code);
    if (sku.id != null && (!Number.isInteger(sku.id) || sku.id <= 0)) {
      throw new TableError('规格无效');
    }
    return {
      id: sku.id,
      code,
      name,
      stock: requireInt(sku.stock, '库存', 0),
      sort: requireInt(sku.sort || '0', '规格排序', 0),
      enabled: sku.enabled ? 1 : 0,
    };
  });
}

function parseSpecs(input: SpecGroup[]): SpecGroup[] {
  if (input.length > 20) throw new TableError('规格参数分组不超过 20 个');
  return input.map((group) => {
    const title = group.title.trim();
    if (!title || title.length > 32) throw new TableError('参数分组名称需为 1–32 个字');
    if (group.rows.length < 1 || group.rows.length > 40) {
      throw new TableError(`「${title}」至少 1 行、最多 40 行`);
    }
    return {
      title,
      rows: group.rows.map((row) => {
        const label = row.label.trim();
        const value = row.value.trim();
        if (!label || label.length > 32) throw new TableError('参数名需为 1–32 个字');
        if (!value || value.length > 200) throw new TableError('参数值需为 1–200 个字');
        return { label, value };
      }),
    };
  });
}

function parseIntroImages(input: ProductInput['introImages']): string[] {
  if (input.length > 30) throw new TableError('商品介绍最多 30 张图');
  return input.map((image) => {
    const stored = image.stored.trim();
    if (!stored.startsWith('qiniu:') || stored.length > 200) throw new TableError('介绍图片地址无效');
    return stored;
  });
}

function parseImages(input: ProductInput['images']) {
  if (input.length > 9) throw new TableError('图集最多 9 张');
  const images = input.map((image) => {
    const stored = image.stored.trim();
    if (!stored.startsWith('qiniu:') || stored.length > 200) throw new TableError('图片地址无效');
    return { stored, list: Boolean(image.list) };
  });
  if (images.length === 0) return images;
  const listed = images.filter((image) => image.list);
  if (listed.length !== 1) throw new TableError('请从图集中选择一张作为列表展示图');
  return images;
}

export function saveProductRecord(input: ProductInput): number {
  const name = input.name.trim();
  const cover = input.cover.trim();
  if (!name || name.length > 128) throw new TableError('商品名称需为 1–128 个字');
  if (!cover || cover.length > 64) throw new TableError('封面文案需为 1–64 个字');
  const points = requireInt(input.points, '兑换积分', 0);
  const price = normalizePrice(input.price || '0');
  const tips = input.tips.map((tip) => tip.trim()).filter(Boolean);
  if (tips.length > 20) throw new TableError('温馨提示不超过 20 条');
  for (const tip of tips) {
    if (tip.length > 200) throw new TableError('单条温馨提示不超过 200 字');
  }
  const skus = parseSkus(input.skus);
  const categoryName = input.newCategoryName.trim();
  if (categoryName.length > 32) throw new TableError('分类名称不超过 32 个字');
  if (input.id != null && (!Number.isInteger(input.id) || input.id <= 0)) {
    throw new TableError('商品无效');
  }

  const images = parseImages(input.images);
  const specs = parseSpecs(input.specs);
  const introImages = parseIntroImages(input.introImages);
  const db = getDb();
  ensureImageTable();
  ensureProductColumns();
  const run = db.transaction(() => {
    let categoryId: number;
    if (categoryName) {
      const sortRow = db
        .prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS sort FROM product_categories')
        .get() as { sort: number };
      const inserted = db
        .prepare(
          `INSERT INTO product_categories (name, sort, enabled, createdAt, updatedAt)
           VALUES (?, ?, 1, datetime('now'), datetime('now'))`,
        )
        .run(categoryName, sortRow.sort);
      categoryId = Number(inserted.lastInsertRowid);
    } else {
      if (!/^\d+$/.test(input.categoryId)) throw new TableError('请选择分类');
      categoryId = Number(input.categoryId);
      const found = db
        .prepare('SELECT id FROM product_categories WHERE id = ?')
        .get(categoryId);
      if (!found) throw new TableError('分类不存在');
    }

    const tipsJson = JSON.stringify(tips);
    const specsJson = JSON.stringify(specs);
    const introJson = JSON.stringify(introImages);
    const enabled = input.enabled ? 1 : 0;
    let productId = input.id;
    if (productId) {
      const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
      if (!existing) throw new TableError('商品不存在');
      db.prepare(
        `UPDATE products
         SET name = ?, points = ?, price = ?, cover = ?, categoryId = ?, tips = ?, specs = ?,
             introImages = ?, enabled = ?, updatedAt = datetime('now')
         WHERE id = ?`,
      ).run(name, points, price, cover, categoryId, tipsJson, specsJson, introJson, enabled, productId);
    } else {
      const inserted = db
        .prepare(
          `INSERT INTO products
             (name, points, price, cover, categoryId, sales, tips, specs, introImages, enabled, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .run(name, points, price, cover, categoryId, tipsJson, specsJson, introJson, enabled);
      productId = Number(inserted.lastInsertRowid);
    }

    const current = db
      .prepare('SELECT id, locked, code FROM product_skus WHERE productId = ?')
      .all(productId) as Array<{ id: number; locked: number; code: string }>;
    const incomingIds = new Set(skus.flatMap((sku) => (sku.id ? [sku.id] : [])));
    for (const sku of current) {
      if (incomingIds.has(sku.id)) continue;
      if (sku.locked > 0) {
        throw new TableError(`规格 ${sku.code} 仍有锁定库存，不能删除`);
      }
      db.prepare('DELETE FROM product_skus WHERE id = ? AND productId = ?').run(sku.id, productId);
    }
    for (const sku of skus) {
      if (sku.id) {
        const updated = db
          .prepare(
            `UPDATE product_skus
             SET code = ?, name = ?, stock = ?, sort = ?, enabled = ?, updatedAt = datetime('now')
             WHERE id = ? AND productId = ?`,
          )
          .run(sku.code, sku.name, sku.stock, sku.sort, sku.enabled, sku.id, productId);
        if (updated.changes === 0) throw new TableError('规格不存在或不属于该商品');
      } else {
        db.prepare(
          `INSERT INTO product_skus
             (productId, code, name, stock, locked, sort, enabled, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))`,
        )        .run(productId, sku.code, sku.name, sku.stock, sku.sort, sku.enabled);
      }
    }
    db.prepare('DELETE FROM product_images WHERE productId = ?').run(productId);
    const insertImage = db.prepare(
      `INSERT INTO product_images (productId, url, sort, isList) VALUES (?, ?, ?, ?)`,
    );
    images.forEach((image, index) => insertImage.run(productId, image.stored, index, image.list ? 1 : 0));
    return productId;
  });

  try {
    return run();
  } catch (error) {
    if (error instanceof TableError) throw error;
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('product_skus')) throw new TableError('规格编码已存在');
      if (error.message.includes('product_categories')) throw new TableError('分类名称已存在');
    }
    throw error;
  }
}
