import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { getAppConfig } from '@/lib/app-config';
import { AdminShell } from '@/components/admin/admin-shell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({ children }) {
  const store = await cookies();
  if (!(await verifySessionToken(store.get(ADMIN_COOKIE)?.value))) {
    redirect('/admin/login');
  }
  const config = await getAppConfig();
  return <AdminShell brand={config.brand.name}>{children}</AdminShell>;
}
