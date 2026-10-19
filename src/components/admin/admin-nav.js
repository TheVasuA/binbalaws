import {
  IconActivity, IconDatabase, IconFlag, IconGauge, IconLayers, IconScroll, IconShield,
} from '@/components/ui/icons';

export const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: IconGauge, description: 'Service health and recent activity' },
  { href: '/admin/trading', label: 'Trading', icon: IconActivity, description: 'Positions, orders and kill switches' },
  { href: '/admin/risk', label: 'Risk limits', icon: IconShield, description: 'Loss limits, leverage and goal settings' },
  { href: '/admin/features', label: 'Features', icon: IconFlag, description: 'Pages, trading rules and announcements' },
  { href: '/admin/baskets', label: 'Bulk baskets', icon: IconLayers, description: 'Server-side auto-exit baskets' },
  { href: '/admin/data', label: 'Data', icon: IconDatabase, description: 'Goal state, order log and caches' },
  { href: '/admin/audit', label: 'Audit log', icon: IconScroll, description: 'Every admin action' },
];

export function adminNavItemFor(pathname) {
  if (pathname === '/admin') return ADMIN_NAV[0];
  return ADMIN_NAV.slice(1).find((item) => pathname.startsWith(item.href)) || null;
}
