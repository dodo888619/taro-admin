import 'server-only';
import { db } from './db';

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

export async function loadDashboard(): Promise<DashboardData> {
  const counts = await db.get<{
    users: number;
    productsOn: number;
    pendingShip: number;
    feedbacks: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM products WHERE enabled = 1) AS productsOn,
       (SELECT COUNT(*) FROM orders WHERE status = 'pending_ship') AS pendingShip,
       (SELECT COUNT(*) FROM user_feedbacks) AS feedbacks`,
  );
  const orders = await db.all<DashboardOrder>(
    `SELECT id, orderNo, productName, skuName, quantity, totalPoints, status, createdAt
     FROM orders ORDER BY id DESC LIMIT 8`,
  );
  return {
    users: Number(counts?.users) || 0,
    productsOn: Number(counts?.productsOn) || 0,
    pendingShip: Number(counts?.pendingShip) || 0,
    feedbacks: Number(counts?.feedbacks) || 0,
    orders,
  };
}
