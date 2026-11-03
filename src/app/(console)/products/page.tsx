import Link from 'next/link';
import { canAccess } from '@/lib/access';
import { requireAdmin } from '@/lib/auth';
import { actionPermission } from '@/lib/menus';
import { listProducts } from '@/lib/products';

export const metadata = { title: '商品列表' };

export default async function ProductsPage() {
  const access = await requireAdmin();
  const canEdit = canAccess(access, actionPermission('product:list', 'update'));
  const canPublish = canAccess(access, actionPermission('product:new', 'create'));
  const products = await listProducts();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>商品列表</h1>
          <p>已发布的商品。改单个字段也可以进原始表。</p>
        </div>
        <div className="inline">
          <Link href="/tables/products">原始表</Link>
          {canPublish ? (
            <Link className="btn btn-primary" href="/products/new">
              发布商品
            </Link>
          ) : null}
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>分类</th>
              <th>积分</th>
              <th>价格</th>
              <th>封面</th>
              <th>库存</th>
              <th>规格数</th>
              <th>销量</th>
              <th>上架</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={11}>还没有商品</td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <td>{product.id}</td>
                  <td title={product.name}>{product.name}</td>
                  <td>{product.categoryName}</td>
                  <td>{product.points}</td>
                  <td>{product.price}</td>
                  <td>
                    {product.listImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.listImage} alt="" style={{ width: 48, height: 48, objectFit: 'cover' }} />
                    ) : (
                      product.cover
                    )}
                  </td>
                  <td>{product.stock}</td>
                  <td>{product.skuCount}</td>
                  <td>{product.sales}</td>
                  <td>{product.enabled ? '是' : '否'}</td>
                  <td>
                    {canEdit ? <Link href={`/products/${product.id}`}>编辑</Link> : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
