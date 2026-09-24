import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate, canAccess, loadAccess, type AdminAccess } from './access';

const COOKIE = 'taro_admin';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  u: string;
  exp: number;
};

function sessionSecret(): string {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('未配置 ADMIN_SECRET');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyCredentials(
  username: string,
  password: string,
): { ok: true } | { ok: false; error: string } {
  return authenticate(username, password);
}

export async function createSession(username: string): Promise<void> {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_MS } satisfies SessionPayload),
  ).toString('base64url');
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readSession(): Promise<{ username: string } | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    if (typeof data.u !== 'string' || !data.u) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminAccess> {
  const session = await readSession();
  if (!session) redirect('/login');
  const access = loadAccess(session.username);
  if (!access) {
    await clearSession();
    redirect('/login');
  }
  return access;
}

export async function requireMenu(code: string): Promise<AdminAccess> {
  const access = await requireAdmin();
  if (!canAccess(access, code)) redirect('/forbidden');
  return access;
}
