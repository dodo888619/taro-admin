import 'server-only';
import { db, type Sql } from './db';
import { TableError } from './errors';
import {
  ensureBannerPositions,
  listBannerPositionOptions,
} from './banner-positions';
import {
  columnKind,
  columnLabel,
  imageUploadFolder,
  isImageUploadColumn,
  isJsonColumn,
  isLongField,
  isReadonlyColumn,
  isSecretColumn,
  orderStatusLabel,
  selectOptionLabel,
  selectOptions,
  tableLabel,
  varcharLimit,
  type ColumnKind,
  type SelectOption,
} from './schema';

export type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

export type FieldMeta = {
  name: string;
  label: string;
  kind: ColumnKind;
  required: boolean;
  long: boolean;
  readonly: boolean;
  json: boolean;
  maxLength: number | null;
  hint: string;
  value: string;
  options: SelectOption[] | null;
  imageUpload: boolean;
  imageFolder: string;
};

export type Cell = { text: string; title: string };

export type ListedRow = {
  pk: string;
  cells: Cell[];
  status?: string;
};

export type ListResult = {
  columns: Array<{ name: string; label: string }>;
  rows: ListedRow[];
  total: number;
  page: number;
  pages: number;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PAGE_SIZE = 20;
const AUTO_TIME = new Set(['createdAt', 'updatedAt']);

type Coerced = { omit: true } | { omit: false; value: unknown };

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new TableError('非法字段名');
  return `\`${name}\``;
}

export async function listTableNames(): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
  );
  const hidden = new Set([
    'admin_menus',
    'admin_roles',
    'admin_users',
    'admin_user_roles',
    'admin_role_menus',
    'admin_role_actions',
    'product_images',
  ]);
  return rows.map((row) => row.name).filter((name) => IDENT.test(name) && !hidden.has(name));
}

export async function assertTable(table: string): Promise<void> {
  if (!IDENT.test(table) || !(await listTableNames()).includes(table)) {
    throw new TableError('数据表不存在');
  }
}

export async function getColumns(table: string): Promise<ColumnInfo[]> {
  await assertTable(table);
  return db.all<ColumnInfo>(
    `SELECT
       ORDINAL_POSITION - 1 AS cid,
       COLUMN_NAME AS name,
       COLUMN_TYPE AS type,
       IF(IS_NULLABLE = 'NO', 1, 0) AS notnull,
       COLUMN_DEFAULT AS dflt_value,
       IF(COLUMN_KEY = 'PRI', 1, 0) AS pk
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    table,
  );
}

export function primaryKey(columns: ColumnInfo[]): ColumnInfo {
  const keys = columns.filter((column) => column.pk > 0);
  if (keys.length !== 1) throw new TableError('仅支持单列主键的表');
  return keys[0];
}

function bindPk(pk: ColumnInfo, raw: string): string | number {
  if (columnKind(pk.type) === 'integer') {
    if (!/^\d+$/.test(raw)) throw new TableError('主键无效');
    return Number(raw);
  }
  if (!raw) throw new TableError('主键无效');
  return raw;
}

function orderClause(columns: ColumnInfo[]): string {
  const names = new Set(columns.map((column) => column.name));
  if (names.has('sort') && names.has('id')) {
    return `${quoteIdent('sort')} ASC, ${quoteIdent('id')} ASC`;
  }
  if (names.has('sort')) return `${quoteIdent('sort')} ASC`;
  if (names.has('createdAt') && names.has('id')) {
    return `${quoteIdent('createdAt')} DESC, ${quoteIdent('id')} DESC`;
  }
  if (names.has('createdAt')) return `${quoteIdent('createdAt')} DESC`;
  if (names.has('id')) return `${quoteIdent('id')} DESC`;
  return `${quoteIdent(primaryKey(columns).name)} ASC`;
}

function buildWhere(
  table: string,
  columns: ColumnInfo[],
  q: string,
  exact: Record<string, string>,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const keyword = q.trim().slice(0, 100);
  if (keyword) {
    const searchable = columns.filter((column) => {
      if (isSecretColumn(table, column.name)) return false;
      const kind = columnKind(column.type);
      return kind === 'text' || kind === 'datetime';
    });
    const likes = searchable.map(
      (column) => `${quoteIdent(column.name)} LIKE ? ESCAPE '\\'`,
    );
    const pattern = `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    if (/^\d+$/.test(keyword) && columns.some((column) => column.name === 'id')) {
      likes.push(`${quoteIdent('id')} = ?`);
    }
    if (likes.length > 0) {
      parts.push(`(${likes.join(' OR ')})`);
      params.push(...searchable.map(() => pattern));
      if (/^\d+$/.test(keyword) && columns.some((column) => column.name === 'id')) {
        params.push(Number(keyword));
      }
    }
  }
  for (const [key, value] of Object.entries(exact)) {
    if (!value || !columns.some((column) => column.name === key)) continue;
    // cancelled 与 failed 对外合并为「已取消」
    if (table === 'orders' && key === 'status' && value === 'cancelled') {
      parts.push(`${quoteIdent(key)} IN (?, ?)`);
      params.push('cancelled', 'failed');
      continue;
    }
    parts.push(`${quoteIdent(key)} = ?`);
    params.push(value);
  }
  return {
    sql: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    params,
  };
}

async function resolveSelectOptions(
  table: string,
  column: string,
  currentValue?: string,
): Promise<SelectOption[] | null> {
  if (table === 'banners' && column === 'position') {
    const options = await listBannerPositionOptions(true);
    const current = currentValue?.trim();
    if (current && !options.some((option) => option.value === current)) {
      const all = await listBannerPositionOptions(false);
      const fallback = all.find((option) => option.value === current);
      options.unshift(fallback ?? { value: current, label: current });
    }
    return options;
  }
  return selectOptions(table, column);
}

function displayCell(
  table: string,
  column: ColumnInfo,
  value: unknown,
  optionLabels?: Map<string, string>,
): Cell {
  if (isSecretColumn(table, column.name)) {
    const text = value == null || value === '' ? '—' : '••••';
    return { text, title: text };
  }
  if (value == null || value === '') return { text: '—', title: '' };
  const kind = columnKind(column.type);
  let text: string;
  switch (kind) {
    case 'boolean':
      text = Number(value) ? '是' : '否';
      break;
    case 'integer':
    case 'number':
    case 'datetime':
      text = String(value);
      break;
    case 'text': {
      const raw = String(value);
      if (table === 'orders' && column.name === 'status') {
        text = orderStatusLabel(raw);
      } else if (optionLabels?.has(raw)) {
        text = optionLabels.get(raw) ?? raw;
      } else if (selectOptions(table, column.name)) {
        text = selectOptionLabel(table, column.name, raw);
      } else {
        text = raw;
      }
      break;
    }
    default: {
      const exhaustive: never = kind;
      text = String(exhaustive);
    }
  }
  const title = text;
  if (text.length > 80) text = `${text.slice(0, 80)}…`;
  return { text, title };
}

export async function listRows(
  table: string,
  options: { page: number; q?: string; exact?: Record<string, string> },
): Promise<ListResult> {
  if (table === 'banners' || table === 'banner_positions') {
    await ensureBannerPositions();
  }
  const columns = await getColumns(table);
  const pk = primaryKey(columns);
  const page = Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
  const where = buildWhere(table, columns, options.q ?? '', options.exact ?? {});
  const totalRow = await db.get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ${quoteIdent(table)} ${where.sql}`,
    ...where.params,
  );
  const total = Number(totalRow?.c) || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = columns.filter((column) => !isSecretColumn(table, column.name));
  const selected = visible.map((column) => quoteIdent(column.name)).join(', ');
  const rows = await db.all<Record<string, unknown>>(
    `SELECT ${selected}, ${quoteIdent(pk.name)} AS __pk
     FROM ${quoteIdent(table)} ${where.sql}
     ORDER BY ${orderClause(columns)}
     LIMIT ? OFFSET ?`,
    ...where.params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );
  const positionOptions =
    table === 'banners' ? await listBannerPositionOptions(false) : null;
  const optionLabels = positionOptions
    ? new Map(positionOptions.map((item) => [item.value, item.label]))
    : undefined;
  return {
    columns: visible.map((column) => ({
      name: column.name,
      label: columnLabel(table, column.name),
    })),
    rows: rows.map((row) => ({
      pk: String(row.__pk ?? row[pk.name] ?? ''),
      cells: visible.map((column) =>
        displayCell(
          table,
          column,
          row[column.name],
          column.name === 'position' ? optionLabels : undefined,
        ),
      ),
      status: table === 'orders' ? String(row.status ?? '') : undefined,
    })),
    total,
    page,
    pages,
  };
}

function toFormValue(
  table: string,
  column: ColumnInfo,
  row: Record<string, unknown> | null,
  options: SelectOption[] | null,
): string {
  if (!row) {
    if (columnKind(column.type) === 'boolean') {
      return column.dflt_value != null && /1|true/i.test(String(column.dflt_value))
        ? '1'
        : '0';
    }
    if (options && options.length > 0) return options[0].value;
    return '';
  }
  const value = row[column.name];
  if (value == null) return '';
  if (columnKind(column.type) === 'boolean') return Number(value) ? '1' : '0';
  if (isJsonColumn(table, column.name) && typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return String(value);
}

function fieldHint(table: string, column: ColumnInfo, creating: boolean): string {
  if (isSecretColumn(table, column.name)) return '密码哈希不能在后台直接修改';
  if (isJsonColumn(table, column.name)) return '填写 JSON，保存时会压缩成一行';
  if (table === 'orders' && column.name === 'status') {
    return '直接修改不会退回积分或调整库存。发货请用列表里的发货按钮';
  }
  if (table === 'product_skus' && column.name === 'code') {
    return '由发布/编辑商品时系统生成，不可修改';
  }
  if (table === 'banner_positions' && column.name === 'code') {
    return '唯一编码，广告位用该值关联；小写字母开头，仅含小写字母/数字/下划线';
  }
  if (isImageUploadColumn(table, column.name)) {
    return '可上传到七牛云，也可直接填写图片 URL';
  }
  if (creating && column.pk) {
    return columnKind(column.type) === 'integer'
      ? '系统自动生成，无需填写'
      : '必填，且不能与已有记录重复';
  }
  return '';
}

export async function describeForm(
  table: string,
  row: Record<string, unknown> | null,
): Promise<{ title: string; pk: string | null; fields: FieldMeta[] }> {
  if (table === 'banners' || table === 'banner_positions') {
    await ensureBannerPositions();
  }
  const columns = await getColumns(table);
  const pk = primaryKey(columns);
  const creating = row == null;
  const fields: FieldMeta[] = [];
  for (const column of columns) {
    if (AUTO_TIME.has(column.name)) continue;
    // 整型自增主键新增时不展示，由数据库自动生成
    if (creating && column.pk > 0 && columnKind(column.type) === 'integer') continue;
    const readonly = isReadonlyColumn(table, column.name) || (!creating && column.pk > 0);
    const kind = columnKind(column.type);
    const secret = isSecretColumn(table, column.name);
    const currentRaw =
      row && row[column.name] != null ? String(row[column.name]) : undefined;
    const options = await resolveSelectOptions(table, column.name, currentRaw);
    const value = secret
      ? row && row[column.name]
        ? '已设置（不可在此修改）'
        : '未设置'
      : toFormValue(table, column, row, options);
    fields.push({
      name: column.name,
      label: columnLabel(table, column.name),
      kind,
      required:
        !readonly &&
        !column.pk &&
        column.notnull === 1 &&
        column.dflt_value == null &&
        kind !== 'boolean',
      long: isLongField(column.type) || isJsonColumn(table, column.name),
      readonly,
      json: isJsonColumn(table, column.name),
      maxLength: varcharLimit(column.type),
      hint: fieldHint(table, column, creating),
      value,
      options,
      imageUpload: isImageUploadColumn(table, column.name),
      imageFolder: imageUploadFolder(table),
    });
  }
  return {
    title: tableLabel(table),
    pk: row ? String(row[pk.name] ?? '') : null,
    fields,
  };
}

export async function getRow(
  table: string,
  pkRaw: string,
): Promise<Record<string, unknown> | null> {
  const columns = await getColumns(table);
  const pk = primaryKey(columns);
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM ${quoteIdent(table)} WHERE ${quoteIdent(pk.name)} = ?`,
    bindPk(pk, pkRaw),
  );
  return row ?? null;
}

async function coerceInput(
  table: string,
  column: ColumnInfo,
  raw: string,
  inserting: boolean,
): Promise<Coerced> {
  const label = columnLabel(table, column.name);
  const kind = columnKind(column.type);
  const text = raw.trim();
  if (!text) {
    if (kind === 'boolean') return { omit: false, value: 0 };
    if (!column.notnull) return { omit: false, value: null };
    if (inserting && column.dflt_value != null) return { omit: true };
    throw new TableError(`请填写${label}`);
  }
  if (isJsonColumn(table, column.name)) {
    try {
      return { omit: false, value: JSON.stringify(JSON.parse(text)) };
    } catch {
      throw new TableError(`${label}需要是合法 JSON`);
    }
  }
  switch (kind) {
    case 'boolean':
      return { omit: false, value: text === '1' || text === 'true' ? 1 : 0 };
    case 'integer': {
      if (!/^-?\d+$/.test(text)) throw new TableError(`${label}须为整数`);
      return { omit: false, value: Number(text) };
    }
    case 'number': {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) throw new TableError(`${label}须为数字`);
      return { omit: false, value: numeric };
    }
    case 'text': {
      const options = await resolveSelectOptions(table, column.name, text);
      if (options && !options.some((option) => option.value === text)) {
        throw new TableError(`请选择有效的${label}`);
      }
      if (table === 'banner_positions' && column.name === 'code') {
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(text)) {
          throw new TableError('位置编码须为小写字母开头，仅含小写字母/数字/下划线');
        }
      }
      const limit = varcharLimit(column.type) ?? 20000;
      if (text.length > limit) throw new TableError(`${label}超过 ${limit} 个字符`);
      return { omit: false, value: text };
    }
    case 'datetime': {
      if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
        throw new TableError(`${label}格式应为 YYYY-MM-DD HH:MM:SS`);
      }
      return { omit: false, value: text };
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

async function insertRow(
  sql: Sql,
  table: string,
  columns: ColumnInfo[],
  input: Record<string, string>,
): Promise<void> {
  const cols: string[] = [];
  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (const column of columns) {
    if (isReadonlyColumn(table, column.name)) continue;
    if (AUTO_TIME.has(column.name)) {
      cols.push(quoteIdent(column.name));
      placeholders.push('UTC_TIMESTAMP()');
      continue;
    }
    const raw = input[column.name] ?? '';
    if (column.pk && !raw.trim() && columnKind(column.type) === 'integer') continue;
    const coerced = await coerceInput(table, column, raw, true);
    if (coerced.omit) continue;
    cols.push(quoteIdent(column.name));
    placeholders.push('?');
    params.push(coerced.value);
  }
  if (cols.length === 0) throw new TableError('没有可写入的字段');
  await sql.run(
    `INSERT INTO ${quoteIdent(table)} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    ...params,
  );
}

async function updateRow(
  sql: Sql,
  table: string,
  columns: ColumnInfo[],
  pk: ColumnInfo,
  pkRaw: string,
  input: Record<string, string>,
): Promise<void> {
  const pkValue = bindPk(pk, pkRaw);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const column of columns) {
    if (column.name === pk.name || column.name === 'createdAt') continue;
    if (isReadonlyColumn(table, column.name)) continue;
    if (column.name === 'updatedAt') {
      sets.push(`${quoteIdent(column.name)} = UTC_TIMESTAMP()`);
      continue;
    }
    if (!(column.name in input)) continue;
    const coerced = await coerceInput(table, column, input[column.name] ?? '', false);
    if (coerced.omit) continue;
    sets.push(`${quoteIdent(column.name)} = ?`);
    params.push(coerced.value);
  }
  if (sets.length === 0) throw new TableError('没有可保存的字段');
  params.push(pkValue);
  const result = await sql.run(
    `UPDATE ${quoteIdent(table)} SET ${sets.join(', ')} WHERE ${quoteIdent(pk.name)} = ?`,
    ...params,
  );
  if (result.changes === 0) {
    const exists = await sql.get(
      `SELECT 1 AS ok FROM ${quoteIdent(table)} WHERE ${quoteIdent(pk.name)} = ?`,
      pkValue,
    );
    if (!exists) throw new TableError('记录不存在');
  }
}

export async function saveRow(
  table: string,
  pkRaw: string,
  input: Record<string, string>,
): Promise<void> {
  if (table === 'banners' || table === 'banner_positions') {
    await ensureBannerPositions();
  }
  const columns = await getColumns(table);
  const pk = primaryKey(columns);
  if (pkRaw && table === 'banner_positions' && 'code' in input) {
    const existing = await db.get<{ code: string }>(
      'SELECT code FROM banner_positions WHERE id = ?',
      bindPk(pk, pkRaw),
    );
    const nextCode = input.code.trim();
    if (existing && nextCode && existing.code !== nextCode) {
      const count = await db.get<{ c: number }>(
        'SELECT COUNT(*) AS c FROM banners WHERE position = ?',
        existing.code,
      );
      if ((count?.c ?? 0) > 0) {
        throw new TableError('仍有广告位使用该位置编码，不能修改编码');
      }
    }
  }
  if (pkRaw) {
    await updateRow(db, table, columns, pk, pkRaw, input);
    return;
  }
  await insertRow(db, table, columns, input);
}

export async function removeRow(table: string, pkRaw: string): Promise<void> {
  const columns = await getColumns(table);
  const pk = primaryKey(columns);
  const pkValue = bindPk(pk, pkRaw);
  if (table === 'products') {
    const count = await db.get<{ c: number }>(
      'SELECT COUNT(*) AS c FROM orders WHERE productId = ?',
      pkValue,
    );
    if ((count?.c ?? 0) > 0) {
      throw new TableError('已有订单引用该商品，请改为下架而不是删除');
    }
  }
  if (table === 'product_skus') {
    const sku = await db.get<{ locked: number; code: string }>(
      'SELECT locked, code FROM product_skus WHERE id = ?',
      pkValue,
    );
    if (sku && sku.locked > 0) {
      throw new TableError(`规格 ${sku.code} 仍有锁定库存，不能删除`);
    }
  }
  if (table === 'banner_positions') {
    const position = await db.get<{ code: string }>(
      'SELECT code FROM banner_positions WHERE id = ?',
      pkValue,
    );
    if (position) {
      const count = await db.get<{ c: number }>(
        'SELECT COUNT(*) AS c FROM banners WHERE position = ?',
        position.code,
      );
      if ((count?.c ?? 0) > 0) {
        throw new TableError('仍有广告位使用该展示位置，请先调整广告位或改为停用');
      }
    }
  }
  const result = await db.run(
    `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(pk.name)} = ?`,
    pkValue,
  );
  if (result.changes === 0) throw new TableError('记录不存在');
}
