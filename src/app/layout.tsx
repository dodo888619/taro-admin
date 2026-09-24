import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '投投管理后台', template: '%s · 投投管理' },
  description: '发布商品并维护业务数据',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
