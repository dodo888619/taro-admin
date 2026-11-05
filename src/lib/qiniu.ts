import 'server-only';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import qiniu from 'qiniu';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function siblingEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), '../taro-api/.env');
  if (!fs.existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

function setting(name: string): string {
  return process.env[name]?.trim() || siblingEnv()[name]?.trim() || '';
}

function domain(): string {
  return setting('QINIU_DOMAIN').replace(/\/$/, '');
}

export function publicImageUrl(stored: string): string {
  const key = stored.startsWith('qiniu:') ? stored.slice('qiniu:'.length) : stored;
  const base = domain();
  if (!base || !key) return stored;
  return `${base}/${key.replace(/^\/+/, '')}`;
}

export function uploadProductImage(
  file: { buffer: Buffer; name: string; type: string },
  folder = 'products',
): Promise<string> {
  const accessKey = setting('QINIU_ACCESS_KEY');
  const secretKey = setting('QINIU_SECRET_KEY');
  const bucket = setting('QINIU_BUCKET');
  if (!accessKey || !secretKey || !bucket || !domain()) {
    throw new Error('七牛云未配置，请填写 QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_BUCKET / QINIU_DOMAIN');
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('只支持 jpg、png、webp、gif');
  if (file.buffer.length > 5 * 1024 * 1024) throw new Error('单张图片不超过 5MB');
  const safeFolder = /^[a-z0-9_-]+$/i.test(folder) ? folder : 'products';
  const key = `${safeFolder}/${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const token = new qiniu.rs.PutPolicy({ scope: bucket }).uploadToken(mac);
  const config = new qiniu.conf.Config();
  config.zone = qiniu.zone.Zone_z0;
  config.useHttpsDomain = true;
  const uploader = new qiniu.form_up.FormUploader(config);
  const extra = new qiniu.form_up.PutExtra();
  if (file.type) extra.mimeType = file.type;
  return new Promise((resolve, reject) => {
    uploader.put(token, key, file.buffer, extra, (error, _body, info) => {
      if (error || info?.statusCode !== 200) {
        reject(new Error('图片上传到七牛云失败'));
        return;
      }
      resolve(`qiniu:${key}`);
    });
  });
}
