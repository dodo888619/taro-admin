import 'server-only';
import { db } from './db';
import { TableError } from './errors';

export type ShipCheckLevel = 'ok' | 'warn' | 'error';

export type ShipCheckItem = {
  key: string;
  label: string;
  level: ShipCheckLevel;
  detail: string;
};

export type ShipReviewOrder = {
  id: number;
  orderNo: string;
  userId: number;
  productId: number;
  productName: string;
  cover: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unitPoints: number;
  totalPoints: number;
  price: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  userNickname: string | null;
  userUsername: string | null;
  userPhone: string | null;
  userEmail: string | null;
  profileSchool: string | null;
  profileGender: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverProvince: string | null;
  receiverCity: string | null;
  receiverDistrict: string | null;
  receiverDetail: string | null;
  addressIsDefault: number | null;
  skuStock: number | null;
  skuLocked: number | null;
  skuEnabled: number | null;
  productEnabled: number | null;
};

const REVIEW_SELECT = `
  SELECT
    o.id,
    o.orderNo,
    o.userId,
    o.productId,
    o.productName,
    o.cover,
    o.skuId,
    o.skuName,
    o.quantity,
    o.unitPoints,
    o.totalPoints,
    o.price,
    o.status,
    o.createdAt,
    o.paidAt,
    u.nickname AS userNickname,
    u.username AS userUsername,
    u.phone AS userPhone,
    u.email AS userEmail,
    up.school AS profileSchool,
    up.gender AS profileGender,
    a.name AS receiverName,
    a.phone AS receiverPhone,
    a.province AS receiverProvince,
    a.city AS receiverCity,
    a.district AS receiverDistrict,
    a.detail AS receiverDetail,
    a.isDefault AS addressIsDefault,
    s.stock AS skuStock,
    s.locked AS skuLocked,
    s.enabled AS skuEnabled,
    p.enabled AS productEnabled
  FROM orders o
  LEFT JOIN users u ON u.id = o.userId
  LEFT JOIN user_profiles up ON up.userId = o.userId
  LEFT JOIN user_addresses a ON a.id = (
    SELECT a2.id
    FROM user_addresses a2
    WHERE a2.userId = o.userId
    ORDER BY a2.isDefault DESC, a2.id DESC
    LIMIT 1
  )
  LEFT JOIN product_skus s ON s.productId = o.productId AND s.code = o.skuId
  LEFT JOIN products p ON p.id = o.productId
`;

function asText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function phoneOk(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

/** 待发货 = 已付款待运营审核；审核通过后变为已发货 */
export function buildShipChecks(order: ShipReviewOrder): ShipCheckItem[] {
  const checks: ShipCheckItem[] = [];
  const userLabel =
    asText(order.userNickname) || asText(order.userUsername) || `用户#${order.userId}`;

  if (!order.userNickname && !order.userUsername && !order.userPhone && !order.userEmail) {
    checks.push({
      key: 'user',
      label: '下单用户',
      level: 'error',
      detail: `未找到用户 #${order.userId}`,
    });
  } else {
    checks.push({
      key: 'user',
      label: '下单用户',
      level: 'ok',
      detail: `${userLabel}${order.userPhone ? ` · ${order.userPhone}` : ''}${
        order.userEmail ? ` · ${order.userEmail}` : ''
      }`,
    });
  }

  const contact = asText(order.userPhone) || asText(order.userEmail);
  if (!contact) {
    checks.push({
      key: 'contact',
      label: '联系方式',
      level: 'error',
      detail: '用户未绑定手机号或邮箱，无法联系',
    });
  } else if (order.userPhone && !phoneOk(asText(order.userPhone))) {
    checks.push({
      key: 'contact',
      label: '联系方式',
      level: 'warn',
      detail: `手机号格式异常：${order.userPhone}`,
    });
  } else {
    checks.push({
      key: 'contact',
      label: '联系方式',
      level: 'ok',
      detail: contact,
    });
  }

  const receiverName = asText(order.receiverName);
  const receiverPhone = asText(order.receiverPhone);
  const region = [order.receiverProvince, order.receiverCity, order.receiverDistrict]
    .map(asText)
    .filter(Boolean)
    .join(' ');
  const detail = asText(order.receiverDetail);

  if (!receiverName || !receiverPhone || !region || !detail) {
    checks.push({
      key: 'address',
      label: '收货信息',
      level: 'error',
      detail: '缺少可用收货地址（姓名/手机/省市区/详细地址）',
    });
  } else if (!phoneOk(receiverPhone)) {
    checks.push({
      key: 'address',
      label: '收货信息',
      level: 'error',
      detail: `收货手机号无效：${receiverPhone}`,
    });
  } else {
    checks.push({
      key: 'address',
      label: '收货信息',
      level: order.addressIsDefault ? 'ok' : 'warn',
      detail: `${receiverName} ${receiverPhone} · ${region} ${detail}${
        order.addressIsDefault ? '' : '（非默认地址，取最近一条）'
      }`,
    });
  }

  if (order.skuStock == null || order.skuEnabled == null) {
    checks.push({
      key: 'sku',
      label: '商品规格',
      level: 'error',
      detail: `规格不存在或已删除（${order.skuId}）`,
    });
  } else if (!order.skuEnabled) {
    checks.push({
      key: 'sku',
      label: '商品规格',
      level: 'error',
      detail: `规格已停用：${order.skuName}`,
    });
  } else {
    checks.push({
      key: 'sku',
      label: '商品规格',
      level: 'ok',
      detail: `${order.productName} / ${order.skuName} × ${order.quantity}`,
    });
  }

  if (order.productEnabled == null) {
    checks.push({
      key: 'product',
      label: '商品状态',
      level: 'error',
      detail: '商品不存在或已删除',
    });
  } else if (!order.productEnabled) {
    checks.push({
      key: 'product',
      label: '商品状态',
      level: 'warn',
      detail: '商品当前已下架，确认仍要审核发货',
    });
  } else {
    checks.push({
      key: 'product',
      label: '商品状态',
      level: 'ok',
      detail: '商品在售',
    });
  }

  // 下单锁定、支付消化库存；审核时只复核数据是否异常
  if (order.skuStock != null) {
    const stock = Number(order.skuStock);
    const locked = Number(order.skuLocked ?? 0);
    if (stock < 0 || locked < 0) {
      checks.push({
        key: 'stock',
        label: '商品库存',
        level: 'error',
        detail: `库存异常：可售 ${stock}，锁定 ${locked}`,
      });
    } else {
      checks.push({
        key: 'stock',
        label: '商品库存',
        level: stock === 0 ? 'warn' : 'ok',
        detail: `可售 ${stock}，锁定 ${locked}（审核发货不再扣库存）`,
      });
    }
  }

  return checks;
}

export function shipReviewBlocked(checks: ShipCheckItem[]): boolean {
  return checks.some((item) => item.level === 'error');
}

export async function listPendingShipReviews(): Promise<ShipReviewOrder[]> {
  return db.all<ShipReviewOrder>(
    `${REVIEW_SELECT}
     WHERE o.status = 'pending_ship'
     ORDER BY o.id DESC`,
  );
}

export async function getShipReviewOrder(id: number): Promise<ShipReviewOrder | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return db.get<ShipReviewOrder>(`${REVIEW_SELECT} WHERE o.id = ?`, id);
}

export async function shipPendingOrder(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new TableError('订单无效');

  const order = await getShipReviewOrder(id);
  if (!order) throw new TableError('订单不存在');
  if (order.status !== 'pending_ship') {
    throw new TableError('仅已付款待发货订单可通过审核');
  }

  const checks = buildShipChecks(order);
  if (shipReviewBlocked(checks)) {
    const first = checks.find((item) => item.level === 'error');
    throw new TableError(first ? `${first.label}：${first.detail}` : '发货审核未通过');
  }

  const result = await db.run(
    `UPDATE orders
     SET status = 'shipped', shippedAt = UTC_TIMESTAMP(), updatedAt = UTC_TIMESTAMP()
     WHERE id = ? AND status = 'pending_ship'`,
    id,
  );
  if (result.changes === 0) throw new TableError('仅已付款待发货订单可通过审核');
}
