import 'server-only';
import { getDb } from './db';

export type DashboardOrder = {
  id: number;
  orderNo: string;
  productName: string;
  skuName: string;
  quantity: number;
  totalPoints: number;
  status: string;
  createdAt: string;
};

export type DashboardData = {
  users: number;
  productsOn: number;
  pendingShip: number;
  feedbacks: number;
  orders: DashboardOrder[];
};

export function loadDashboard(): DashboardData {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM products WHERE enabled = 1) AS productsOn,
         (SELECT COUNT(*) FROM orders WHERE status = 'pending_ship') AS pendingShip,
         (SELECT COUNT(*) FROM user_feedbacks) AS feedbacks`,
    )
    .get() as {
    users: number;
    productsOn: number;
    pendingShip: number;
    feedbacks: number;
  };
  const orders = db
    .prepare(
      `SELECT id, orderNo, productName, skuName, quantity, totalPoints, status, createdAt
       FROM orders ORDER BY id DESC LIMIT 8`,
    )
    .all() as DashboardOrder[];
  return { ...counts, orders };
}
