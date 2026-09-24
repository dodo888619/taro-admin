import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { ProductForm } from '@/components/ProductForm';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { getProduct, listCategories } from '@/lib/products';

export const metadata = { title: '编辑商品' };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(id)) {
    return (
      <div className="card">
        <h1>商品不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/products">返回商品列表</Link>
        </p>
      </div>
    );
  }
  const access = await requireAdmin();
  const product = getProduct(Number(id));
  if (!product) {
    return (
      <div className="card">
        <h1>商品不存在</h1>
        <p style={{ marginTop: 8 }}>
          <Link href="/products">返回商品列表</Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{product.name}</h1>
          <p>修改名称、积分、提示和规格库存</p>
        </div>
        <Link href="/products">返回列表</Link>
      </div>
      <Flash saved={query.saved} error={query.error} />
      <ProductForm
        categories={listCategories()}
        initial={product}
        canSave={canAccess(access, actionPermission('product:list', 'update'))}
      />
    </>
  );
}
