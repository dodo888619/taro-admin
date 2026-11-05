import { readSession } from '@/lib/auth';
import { publicImageUrl, uploadProductImage } from '@/lib/qiniu';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return Response.json({ error: '未登录' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: '请选择图片' }, { status: 400 });
  const folderRaw = form.get('folder');
  const folder = typeof folderRaw === 'string' && folderRaw.trim() ? folderRaw.trim() : 'products';
  try {
    const stored = await uploadProductImage(
      {
        buffer: Buffer.from(await file.arrayBuffer()),
        name: file.name,
        type: file.type,
      },
      folder,
    );
    return Response.json({ stored, url: publicImageUrl(stored) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败';
    return Response.json({ error: message }, { status: 400 });
  }
}
