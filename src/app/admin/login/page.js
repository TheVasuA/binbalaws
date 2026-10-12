import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isAdminConfigured, verifySessionToken } from '@/lib/admin-auth';
import { getAppConfig } from '@/lib/app-config';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

// Only same-app admin paths are allowed as a post-login destination.
function safeNext(value) {
  const next = typeof value === 'string' ? value : '';
  return /^\/admin(\/[\w-]*)*$/.test(next) && next !== '/admin/login' ? next : '/admin';
}

export default async function AdminLoginPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNext(params?.next);
  const store = await cookies();
  if (await verifySessionToken(store.get(ADMIN_COOKIE)?.value)) redirect(next);

  const config = await getAppConfig();
  return <LoginForm brand={config.brand.name} next={next} configured={isAdminConfigured()} />;
}
