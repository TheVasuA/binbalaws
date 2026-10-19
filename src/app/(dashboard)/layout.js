import { getAppConfig, getPortfolioSettings } from '@/lib/app-config';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { MaintenanceScreen } from '@/components/shell/maintenance';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }) {
  const [config, settings] = await Promise.all([getAppConfig(), getPortfolioSettings()]);

  if (config.maintenance.enabled) {
    return <MaintenanceScreen brand={config.brand.name} message={config.maintenance.message} />;
  }

  return (
    <DashboardShell initialConfig={config} initialSettings={settings}>
      {children}
    </DashboardShell>
  );
}
