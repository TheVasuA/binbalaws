import {
  IconChart,
  IconDashboard,
  IconGlobe,
  IconLayers,
  IconOrder,
  IconSliders,
  IconTarget,
} from '@/components/ui/icons';

// `feature` ties an item to an admin feature flag (see FEATURE_PAGES).
export const NAV_GROUPS = [
  {
    label: 'Trading',
    items: [
      { href: '/', label: 'Dashboard', icon: IconDashboard },
      { href: '/new-order', label: 'New order', icon: IconOrder, feature: 'newOrder' },
      { href: '/bulk-order', label: 'Bulk scalp', icon: IconLayers, feature: 'bulkOrder' },
    ],
  },
  {
    label: 'Research',
    items: [
      { href: '/markets', label: 'Markets', icon: IconGlobe, feature: 'markets' },
      { href: '/trades', label: 'History', icon: IconChart, feature: 'history' },
    ],
  },
  {
    label: 'Plan',
    items: [{ href: '/compound', label: 'Goal', icon: IconTarget, feature: 'goal' }],
  },
];

export const SETTINGS_ITEM = { href: '/settings', label: 'Settings', icon: IconSliders };

const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

export function navItemFor(pathname) {
  return ALL_ITEMS.find((item) => item.href === pathname) || null;
}

export function visibleGroups(features) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.feature || features?.[item.feature] !== false),
  })).filter((group) => group.items.length > 0);
}
