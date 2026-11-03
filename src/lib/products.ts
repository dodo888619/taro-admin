import 'server-only';
import { db, isDuplicateError, transaction } from './db';
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

async function ensureProductColumns(): Promise<void> {
  const rows = await db.all<{ name: string }>(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`,
  );
  const names = new Set(rows.map((row) => row.name));
  if (!names.has('specs')) {
    await db.exec(`ALTER TABLE products ADD COLUMN specs TEXT NOT NULL DEFAULT ('[]')`);
  }
  if (!names.has('introImages')) {
    await db.exec(`ALTER TABLE products ADD COLUMN introImages TEXT NOT NULL DEFAULT ('[]')`);
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

async function ensureImageTable(): Promise<void> {
  const existing = await db.get(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_images'`,
  );
  if (existing) return;
  await db.exec(`
    CREATE TABLE product_images (
      id INT NOT NULL AUTO_INCREMENT,
      productId INT NOT NULL,
      url VARCHAR(200) NOT NULL,
      sort INT NOT NULL DEFAULT 0,
      isList TINYINT NOT NULL DEFAULT 0,
      createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      KEY IDX_product_images_productId (productId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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

export async function listCategories(): Promise<CategoryOption[]> {
  const rows = await db.all<{ id: number; name: string; enabled: number }>(
    `SELECT id, name, enabled FROM product_categories ORDER BY sort ASC, id ASC`,
  );
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

export async function listProducts(): Promise<ProductListItem[]> {
  await ensureImageTable();
  const rows = await db.all<ProductListRow>(
    `SELECT p.id, p.name, p.points, p.price, p.cover, p.sales, p.enabled,
            COALESCE(c.name, '—') AS categoryName,
            COALESCE(SUM(s.stock), 0) AS stock,
            COUNT(s.id) AS skuCount
     FROM products p
     LEFT JOIN product_categories c ON c.id = p.categoryId
     LEFT JOIN product_skus s ON s.productId = p.id
     GROUP BY p.id, p.name, p.points, p.price, p.cover, p.sales, p.enabled, c.name
     ORDER BY p.id DESC`,
  );
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    name: row.name,
    points: row.points,
    price: row.price,
    cover: row.cover,
    listImage: await listImageOf(row.id),
    categoryName: row.categoryName,
    sales: row.sales,
    stock: Number(row.stock) || 0,
    enabled: Boolean(row.enabled),
    skuCount: Number(row.skuCount) || 0,
  })));
}

async function listImageOf(productId: number): Promise<string> {
  const row = await db.get<{ url: string }>(
    `SELECT url FROM product_images WHERE productId = ? AND isList = 1 ORDER BY sort ASC, id ASC LIMIT 1`,
    productId,
  );
  return row ? publicImageUrl(row.url) : '';
}

async function productImages(productId: number): Promise<ProductImageValue[]> {
  const rows = await db.all<{ url: string; isList: number }>(
    `SELECT url, isList FROM product_images WHERE productId = ? ORDER BY sort ASC, id ASC`,
    productId,
  );
  return rows.map((row) => ({
    stored: row.url,
    url: publicImageUrl(row.url),
    list: Boolean(row.isList),
  }));
}

export async function getProduct(id: number): Promise<ProductFormValue | null> {
  await ensureImageTable();
  await ensureProductColumns();
  const product = await db.get<ProductRow>(
    `SELECT id, name, points, price, cover, categoryId, sales, tips, enabled, specs, introImages
     FROM products WHERE id = ?`,
    id,
  );
  if (!product) return null;
  const skus = await db.all<SkuRow>(
    `SELECT id, code, name, stock, locked, sort, enabled
     FROM product_skus WHERE productId = ?
     ORDER BY sort ASC, id ASC`,
    id,
  );
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
    images: await productImages(product.id),
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

export async function saveProductRecord(input: ProductInput): Promise<number> {
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
  await ensureImageTable();
  await ensureProductColumns();
  try {
    return await transaction(async (sql) => {
      let categoryId: number;
      if (categoryName) {
        const sortRow = await sql.get<{ sort: number }>(
          'SELECT COALESCE(MAX(sort), 0) + 1 AS sort FROM product_categories',
        );
        const inserted = await sql.run(
          `INSERT INTO product_categories (name, sort, enabled, createdAt, updatedAt)
           VALUES (?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          categoryName,
          sortRow?.sort ?? 1,
        );
        categoryId = Number(inserted.lastInsertRowid);
      } else {
        if (!/^\d+$/.test(input.categoryId)) throw new TableError('请选择分类');
        categoryId = Number(input.categoryId);
        const found = await sql.get('SELECT id FROM product_categories WHERE id = ?', categoryId);
        if (!found) throw new TableError('分类不存在');
      }

      const tipsJson = JSON.stringify(tips);
      const specsJson = JSON.stringify(specs);
      const introJson = JSON.stringify(introImages);
      const enabled = input.enabled ? 1 : 0;
      let productId = input.id;
      if (productId) {
        const existing = await sql.get('SELECT id FROM products WHERE id = ?', productId);
        if (!existing) throw new TableError('商品不存在');
        await sql.run(
          `UPDATE products
           SET name = ?, points = ?, price = ?, cover = ?, categoryId = ?, tips = ?, specs = ?,
               introImages = ?, enabled = ?, updatedAt = UTC_TIMESTAMP()
           WHERE id = ?`,
          name,
          points,
          price,
          cover,
          categoryId,
          tipsJson,
          specsJson,
          introJson,
          enabled,
          productId,
        );
      } else {
        const inserted = await sql.run(
          `INSERT INTO products
             (name, points, price, cover, categoryId, sales, tips, specs, introImages, enabled, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          name,
          points,
          price,
          cover,
          categoryId,
          tipsJson,
          specsJson,
          introJson,
          enabled,
        );
        productId = Number(inserted.lastInsertRowid);
      }

      const current = await sql.all<{ id: number; locked: number; code: string }>(
        'SELECT id, locked, code FROM product_skus WHERE productId = ?',
        productId,
      );
      const incomingIds = new Set(skus.flatMap((sku) => (sku.id ? [sku.id] : [])));
      for (const sku of current) {
        if (incomingIds.has(sku.id)) continue;
        if (sku.locked > 0) {
          throw new TableError(`规格 ${sku.code} 仍有锁定库存，不能删除`);
        }
        await sql.run('DELETE FROM product_skus WHERE id = ? AND productId = ?', sku.id, productId);
      }
      for (const sku of skus) {
        if (sku.id) {
          const updated = await sql.run(
            `UPDATE product_skus
             SET code = ?, name = ?, stock = ?, sort = ?, enabled = ?, updatedAt = UTC_TIMESTAMP()
             WHERE id = ? AND productId = ?`,
            sku.code,
            sku.name,
            sku.stock,
            sku.sort,
            sku.enabled,
            sku.id,
            productId,
          );
          if (updated.changes === 0) {
            const exists = await sql.get(
              'SELECT id FROM product_skus WHERE id = ? AND productId = ?',
              sku.id,
              productId,
            );
            if (!exists) throw new TableError('规格不存在或不属于该商品');
          }
        } else {
          await sql.run(
            `INSERT INTO product_skus
               (productId, code, name, stock, locked, sort, enabled, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, 0, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            productId,
            sku.code,
            sku.name,
            sku.stock,
            sku.sort,
            sku.enabled,
          );
        }
      }
      await sql.run('DELETE FROM product_images WHERE productId = ?', productId);
      for (const [index, image] of images.entries()) {
        await sql.run(
          'INSERT INTO product_images (productId, url, sort, isList) VALUES (?, ?, ?, ?)',
          productId,
          image.stored,
          index,
          image.list ? 1 : 0,
        );
      }
      return productId;
    });
  } catch (error) {
    if (error instanceof TableError) throw error;
    if (isDuplicateError(error)) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('product_skus')) throw new TableError('规格编码已存在');
      if (message.includes('product_categories')) throw new TableError('分类名称已存在');
      throw new TableError('数据重复');
    }
    throw error;
  }
}
