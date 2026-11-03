export type ColumnKind = 'boolean' | 'integer' | 'number' | 'text' | 'datetime';

export type TableGroup = {
  id: string;
  title: string;
  tables: string[];
};

export const TABLE_GROUPS: TableGroup[] = [
  {
    id: 'mall',
    title: '商品与订单',
    tables: ['products', 'product_skus', 'product_categories', 'orders'],
  },
  {
    id: 'users',
    title: '用户',
    tables: [
      'users',
      'user_profiles',
      'user_addresses',
      'user_feedbacks',
    ],
  },
  {
    id: 'points',
    title: '积分',
    tables: [
      'user_points',
      'user_points_records',
      'user_check_ins',
      'point_tasks',
      'user_task_progress',
    ],
  },
  {
    id: 'learn',
    title: '学习',
    tables: [
      'learn_categories',
      'learn_articles',
      'learn_exercises',
      'user_article_reads',
      'user_exercise_completes',
    ],
  },
  {
    id: 'ops',
    title: '运营',
    tables: ['banners', 'survey_questions', 'user_survey_responses'],
  },
  {
    id: 'system',
    title: '工具',
    tables: ['email_codes', 'captchas', 'regions'],
  },
];

const TABLE_LABELS: Record<string, string> = {
  users: '用户',
  user_profiles: '用户资料',
  email_codes: '邮箱验证码',
  captchas: '图形验证码',
  regions: '行政区划',
  user_addresses: '收货地址',
  user_feedbacks: '用户反馈',
  product_categories: '商品分类',
  products: '商品',
  product_skus: '商品规格',
  user_points: '积分账户',
  user_points_records: '积分流水',
  user_check_ins: '签到记录',
  point_tasks: '积分任务',
  user_task_progress: '任务进度',
  learn_categories: '学习分类',
  learn_articles: '学习文章',
  learn_exercises: '学习练习',
  user_article_reads: '文章阅读记录',
  user_exercise_completes: '练习完成记录',
  orders: '订单',
  banners: '广告位',
  survey_questions: '问卷题目',
  user_survey_responses: '问卷答卷',
};

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  openid: '微信 openid',
  unionid: '微信 unionid',
  qqOpenid: 'QQ openid',
  webOpenid: '微信网站应用 openid',
  phone: '手机号',
  username: '用户名',
  email: '邮箱',
  passwordHash: '登录密码哈希',
  tradePasswordHash: '交易密码哈希',
  nickname: '昵称',
  avatarUrl: '头像',
  passwordFailCount: '密码失败次数',
  passwordLocked: '密码已锁定',
  tradePasswordFailCount: '交易密码失败次数',
  tradePasswordLocked: '交易密码已锁定',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  userId: '用户 ID',
  gender: '性别',
  birthday: '生日',
  school: '学校',
  code: '编码',
  purpose: '用途',
  usedAt: '使用时间',
  expiresAt: '过期时间',
  name: '名称',
  parentId: '上级 ID',
  level: '层级',
  sort: '排序',
  province: '省',
  city: '市',
  district: '区/县',
  detail: '详细地址',
  isDefault: '默认地址',
  complaint: '投诉',
  suggestion: '建议',
  points: '积分',
  price: '展示价格（元）',
  cover: '封面文案',
  categoryId: '分类 ID',
  sales: '销量',
  tips: '温馨提示 JSON',
  enabled: '启用',
  productId: '商品 ID',
  stock: '可售库存',
  locked: '锁定库存',
  balance: '余额',
  title: '标题',
  amount: '变动积分',
  type: '类型',
  balanceAfter: '变动后余额',
  checkDate: '签到日期',
  pointsAwarded: '发放积分',
  rewardPoints: '奖励积分',
  period: '周期',
  target: '目标次数',
  actionText: '按钮文案',
  icon: '图标',
  iconBg: '图标背景色',
  actionUrl: '跳转路径',
  showInActivityList: '展示在活动列表',
  taskCode: '任务编码',
  periodKey: '周期键',
  progress: '进度',
  completed: '已完成',
  completedAt: '完成时间',
  subtitle: '副标题',
  externalUrl: '外部链接',
  paragraphs: '正文 JSON',
  articleId: '文章 ID',
  description: '说明',
  sourceUrl: '原文链接',
  questions: '题目 JSON',
  exerciseId: '练习 ID',
  orderNo: '订单号',
  productName: '商品名称',
  skuId: '规格编码',
  skuName: '规格名称',
  quantity: '数量',
  unitPoints: '单价积分',
  totalPoints: '总积分',
  status: '状态',
  paidAt: '支付时间',
  shippedAt: '发货时间',
  cancelledAt: '取消时间',
  position: '广告位',
  imageUrl: '图片 URL',
  linkUrl: '跳转链接',
  bgColor: '背景色',
  required: '必填',
  options: '选项 JSON',
  placeholder: '占位提示',
  answers: '答案 JSON',
};

const TABLE_COLUMN_LABELS: Record<string, Record<string, string>> = {
  product_skus: { code: '规格编码', name: '规格名称' },
  point_tasks: { code: '任务编码', title: '任务标题' },
  learn_categories: { code: '分类编码', name: '分类名称' },
  learn_articles: { code: '文章编码', categoryId: '学习分类 ID' },
  learn_exercises: { code: '练习编码' },
  survey_questions: { code: '题目编码', type: '题型', title: '题目标题' },
  user_points_records: { type: '收支类型', title: '流水说明' },
  email_codes: { code: '验证码' },
  captchas: { code: '验证码', id: '验证码 ID' },
  regions: { id: '区划代码', name: '区划名称' },
  products: { name: '商品名称', points: '兑换积分' },
  product_categories: { name: '分类名称' },
  orders: { cover: '封面快照', price: '展示价格快照' },
  banners: { title: '主标题' },
};

const JSON_COLUMNS: Record<string, string[]> = {
  products: ['tips'],
  learn_articles: ['paragraphs'],
  learn_exercises: ['questions'],
  survey_questions: ['options'],
  user_survey_responses: ['answers'],
};

const SECRET_COLUMNS: Record<string, string[]> = {
  users: ['passwordHash', 'tradePasswordHash'],
};

const ORDER_STATUSES = [
  'pending_pay',
  'pending_ship',
  'shipped',
  'completed',
  'cancelled',
  'failed',
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];

export function tableLabel(table: string): string {
  return TABLE_LABELS[table] ?? table;
}

export function columnLabel(table: string, column: string): string {
  return TABLE_COLUMN_LABELS[table]?.[column] ?? COLUMN_LABELS[column] ?? column;
}

export function columnKind(type: string): ColumnKind {
  const normalized = type.toLowerCase();
  if (normalized.includes('bool') || normalized.startsWith('tinyint')) return 'boolean';
  if (normalized.includes('int')) return 'integer';
  if (
    normalized.includes('real') ||
    normalized.includes('floa') ||
    normalized.includes('doub') ||
    normalized.includes('num')
  ) {
    return 'number';
  }
  if (normalized.includes('date') || normalized.includes('time')) return 'datetime';
  return 'text';
}

export function varcharLimit(type: string): number | null {
  const match = type.toLowerCase().match(/^(?:varchar|char|nvarchar)\((\d+)\)$/);
  return match ? Number(match[1]) : null;
}

export function isLongField(type: string): boolean {
  if (columnKind(type) !== 'text') return false;
  const limit = varcharLimit(type);
  if (limit == null) return type.toLowerCase().includes('text');
  return limit >= 255;
}

export function isJsonColumn(table: string, column: string): boolean {
  return JSON_COLUMNS[table]?.includes(column) ?? false;
}

export function isSecretColumn(table: string, column: string): boolean {
  return SECRET_COLUMNS[table]?.includes(column) ?? false;
}

export function isReadonlyColumn(table: string, column: string): boolean {
  return isSecretColumn(table, column);
}

export function groupTables(existing: string[]): TableGroup[] {
  const known = new Set(TABLE_GROUPS.flatMap((group) => group.tables));
  const groups = TABLE_GROUPS.map((group) => ({
    ...group,
    tables: group.tables.filter((table) => existing.includes(table)),
  })).filter((group) => group.tables.length > 0);
  const rest = existing.filter((table) => !known.has(table));
  if (rest.length > 0) {
    groups.push({ id: 'other', title: '其他', tables: rest });
  }
  return groups;
}

function isOrderStatus(status: string): status is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(status);
}

export function orderStatusLabel(status: string): string {
  if (!isOrderStatus(status)) return status;
  switch (status) {
    case 'pending_pay':
      return '待付款';
    case 'pending_ship':
      return '待发货';
    case 'shipped':
      return '已发货';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    case 'failed':
      return '已失败';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function deleteWarning(table: string): string {
  switch (table) {
    case 'orders':
      return '删除订单不会自动退回积分或库存。';
    case 'products':
      return '将同时删除其规格。已有订单时会拒绝删除。';
    case 'users':
      return '删除用户不会级联清理订单和积分。';
    default:
      return '';
  }
}
