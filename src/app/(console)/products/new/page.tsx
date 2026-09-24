import Link from 'next/link';
import { ProductForm } from '@/components/ProductForm';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { listCategories } from '@/lib/products';

export const metadata = { title: '发布商品' };

export default async function NewProductPage() {
  const access = await requireAdmin();
  const categories = listCategories();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>发布商品</h1>
          <p>写入商品、分类和规格。封面是短文案，积分是兑换单价。</p>
        </div>
        <Link href="/products">返回列表</Link>
      </div>
      <ProductForm categories={categories} canSave={canAccess(access, actionPermission('product:new', 'create'))} />
    </>
  );
}
