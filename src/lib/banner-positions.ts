import 'server-only';
import { db } from './db';
import { publicImageUrl } from './qiniu';
import type { SelectOption } from './schema';

const DEFAULT_POSITIONS: Array<{ code: string; name: string; sort: number }> = [
  { code: 'home', name: '首页', sort: 0 },
  { code: 'mall', name: '商城', sort: 1 },
  { code: 'mall_detail', name: '商品详情', sort: 2 },
];

export async function ensureBannerPositions(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS banner_positions (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(64) NOT NULL,
      sort INT NOT NULL DEFAULT 0,
      enabled TINYINT NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY UQ_banner_positions_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  for (const item of DEFAULT_POSITIONS) {
    await db.run(
      `INSERT INTO banner_positions (code, name, sort, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()) AS new
       ON DUPLICATE KEY UPDATE
         name = new.name,
         sort = new.sort,
         enabled = 1,
         updatedAt = UTC_TIMESTAMP()`,
      item.code,
      item.name,
      item.sort,
    );
  }
}

export async function listBannerPositionOptions(
  enabledOnly = true,
): Promise<SelectOption[]> {
  await ensureBannerPositions();
  const rows = await db.all<{ code: string; name: string }>(
    enabledOnly
      ? `SELECT code, name FROM banner_positions WHERE enabled = 1 ORDER BY sort ASC, id ASC`
      : `SELECT code, name FROM banner_positions ORDER BY sort ASC, id ASC`,
  );
  return rows.map((row) => ({ value: row.code, label: row.name }));
}

export async function bannerPositionLabel(code: string): Promise<string> {
  await ensureBannerPositions();
  const row = await db.get<{ name: string }>(
    'SELECT name FROM banner_positions WHERE code = ? LIMIT 1',
    code,
  );
  return row?.name ?? code;
}

export type BannerPositionBanner = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  sort: number;
  enabled: boolean;
};

export type BannerPositionGroup = {
  id: number;
  code: string;
  name: string;
  sort: number;
  enabled: boolean;
  banners: BannerPositionBanner[];
};

export async function listBannerPositionGroups(): Promise<{
  groups: BannerPositionGroup[];
  orphanBanners: Array<BannerPositionBanner & { position: string }>;
}> {
  await ensureBannerPositions();
  const positions = await db.all<{
    id: number;
    code: string;
    name: string;
    sort: number;
    enabled: number;
  }>(
    `SELECT id, code, name, sort, enabled
     FROM banner_positions
     ORDER BY sort ASC, id ASC`,
  );
  const banners = await db.all<{
    id: number;
    position: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
    sort: number;
    enabled: number;
  }>(
    `SELECT id, position, title, subtitle, imageUrl, linkUrl, sort, enabled
     FROM banners
     ORDER BY sort ASC, id ASC`,
  );
  const byCode = new Map<string, BannerPositionBanner[]>();
  for (const position of positions) {
    byCode.set(position.code, []);
  }
  const orphanBanners: Array<BannerPositionBanner & { position: string }> = [];
  for (const banner of banners) {
    const item: BannerPositionBanner = {
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle ?? '',
      imageUrl: banner.imageUrl ? publicImageUrl(banner.imageUrl) : '',
      linkUrl: banner.linkUrl ?? '',
      sort: banner.sort,
      enabled: Number(banner.enabled) === 1,
    };
    const list = byCode.get(banner.position);
    if (list) {
      list.push(item);
    } else {
      orphanBanners.push({ ...item, position: banner.position });
    }
  }
  return {
    groups: positions.map((position) => ({
      id: position.id,
      code: position.code,
      name: position.name,
      sort: position.sort,
      enabled: Number(position.enabled) === 1,
      banners: byCode.get(position.code) ?? [],
    })),
    orphanBanners,
  };
}
