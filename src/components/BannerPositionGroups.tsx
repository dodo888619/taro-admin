import Link from 'next/link';
import type { BannerPositionGroup, BannerPositionBanner } from '@/lib/banner-positions';

function BannerRows({
  banners,
  canEditBanner,
  emptyText,
}: {
  banners: BannerPositionBanner[];
  canEditBanner: boolean;
  emptyText: string;
}) {
  if (banners.length === 0) {
    return <p className="muted" style={{ margin: '8px 0 0' }}>{emptyText}</p>;
  }
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>主标题</th>
            <th>副标题</th>
            <th>图片</th>
            <th>排序</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((banner) => (
            <tr key={banner.id}>
              <td>{banner.id}</td>
              <td title={banner.title}>{banner.title || '—'}</td>
              <td title={banner.subtitle}>{banner.subtitle || '—'}</td>
              <td>
                {banner.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={banner.imageUrl}
                    alt=""
                    style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 4 }}
                  />
                ) : (
                  '—'
                )}
              </td>
              <td>{banner.sort}</td>
              <td>{banner.enabled ? '是' : '否'}</td>
              <td>
                {canEditBanner ? (
                  <Link href={`/tables/banners/edit?pk=${banner.id}`}>编辑</Link>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BannerPositionGroups({
  groups,
  orphanBanners,
  canEditPosition,
  canCreateBanner,
  canEditBanner,
}: {
  groups: BannerPositionGroup[];
  orphanBanners: Array<BannerPositionBanner & { position: string }>;
  canEditPosition: boolean;
  canCreateBanner: boolean;
  canEditBanner: boolean;
}) {
  return (
    <div className="banner-groups">
      {groups.length === 0 ? (
        <div className="card">
          <p>还没有展示位置，请先新增。</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="banner-group">
            <div className="banner-group-head">
              <div>
                <h2>
                  {group.name}
                  <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                    {group.code}
                  </span>
                </h2>
                <p className="muted">
                  排序 {group.sort} · {group.enabled ? '启用' : '停用'} · {group.banners.length} 条广告
                </p>
              </div>
              <div className="ops">
                {canEditPosition ? (
                  <Link href={`/tables/banner_positions/edit?pk=${group.id}`}>编辑位置</Link>
                ) : null}
                {canCreateBanner ? (
                  <Link
                    className="btn btn-tiny"
                    href={`/tables/banners/edit?position=${encodeURIComponent(group.code)}`}
                  >
                    新增广告
                  </Link>
                ) : null}
              </div>
            </div>
            <BannerRows
              banners={group.banners}
              canEditBanner={canEditBanner}
              emptyText="该位置还没有广告位"
            />
          </section>
        ))
      )}
      {orphanBanners.length > 0 ? (
        <section className="banner-group">
          <div className="banner-group-head">
            <div>
              <h2>未登记位置</h2>
              <p className="muted">广告位的 position 在展示位置表中不存在，请修正或补登记</p>
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>位置编码</th>
                  <th>主标题</th>
                  <th>图片</th>
                  <th>排序</th>
                  <th>启用</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orphanBanners.map((banner) => (
                  <tr key={banner.id}>
                    <td>{banner.id}</td>
                    <td>{banner.position}</td>
                    <td title={banner.title}>{banner.title || '—'}</td>
                    <td>
                      {banner.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={banner.imageUrl}
                          alt=""
                          style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 4 }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{banner.sort}</td>
                    <td>{banner.enabled ? '是' : '否'}</td>
                    <td>
                      {canEditBanner ? (
                        <Link href={`/tables/banners/edit?pk=${banner.id}`}>编辑</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
