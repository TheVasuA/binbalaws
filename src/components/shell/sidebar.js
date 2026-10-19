'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { IconPanelLeft, IconShield, IconX } from '@/components/ui/icons';
import { useAppConfig } from '@/components/providers/app-data';
import { SETTINGS_ITEM, visibleGroups } from './nav';
import { GoalSummary } from './goal-summary';

export function BrandMark({ name, collapsed }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fg text-[11px] font-bold tracking-tight text-bg">
        {name.slice(0, 2).toUpperCase()}
      </span>
      {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight text-fg">{name}</span>}
    </span>
  );
}

function NavLink({ item, active, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
        active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
      <Icon size={16} className={cn('shrink-0', active ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SidebarContent({ collapsed, onNavigate, onToggleCollapse, onClose }) {
  const pathname = usePathname();
  const config = useAppConfig();
  const groups = visibleGroups(config.features);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center justify-between border-b border-line px-4', collapsed && 'justify-center px-0')}>
        <Link href="/" onClick={onNavigate} aria-label={`${config.brand.name} home`}>
          <BrandMark name={config.brand.name} collapsed={collapsed} />
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Close menu">
            <IconX size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-line p-3">
        {!collapsed && <GoalSummary onNavigate={onNavigate} />}
        <div className="space-y-0.5">
          <NavLink item={SETTINGS_ITEM} active={pathname === SETTINGS_ITEM.href} collapsed={collapsed} onNavigate={onNavigate} />
          <NavLink item={{ href: '/admin', label: 'Admin', icon: IconShield }} active={false} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <IconPanelLeft size={16} />
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggleCollapse }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-surface transition-[width] duration-200 lg:block',
        collapsed ? 'w-[60px]' : 'w-[232px]',
      )}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
    </aside>
  );
}

export function MobileSidebar({ open, onClose }) {
  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cn('absolute inset-0 bg-[var(--overlay)] transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-line bg-surface shadow-pop transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        inert={!open}
      >
        <SidebarContent onNavigate={onClose} onClose={onClose} />
      </aside>
    </div>
  );
}
