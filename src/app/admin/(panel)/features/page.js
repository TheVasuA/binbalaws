'use client';

import { useMemo, useState } from 'react';
import {
  Callout, Card, CardBody, CardHeader, Field, Input, Page, PageHeader, Segmented, Skeleton, Switch, Textarea, useConfirm,
} from '@/components/ui';
import { IconAlert, IconInfo, IconXCircle } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { useNotify } from '@/lib/notify';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FEATURE_PAGES } from '@/lib/app-config-schema';
import { adminRequest } from '@/components/admin/admin-api';
import { SaveBar } from '@/components/admin/save-bar';

const MESSAGE_MAX = 280;

const BANNER = {
  info: { cls: 'border-accent/25 bg-accent/8', icon: IconInfo, iconCls: 'text-accent' },
  warn: { cls: 'border-warn/30 bg-warn/8', icon: IconAlert, iconCls: 'text-warn' },
  danger: { cls: 'border-neg/30 bg-neg/8', icon: IconXCircle, iconCls: 'text-neg' },
};

function setIn(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  for (const k of keys.slice(0, -1)) node = node[k];
  node[keys.at(-1)] = value;
  return obj;
}

function changedPaths(a, b, prefix = '') {
  const out = [];
  for (const key of Object.keys(b || {})) {
    if (key === 'updatedAt') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const av = a?.[key];
    const bv = b[key];
    if (bv && typeof bv === 'object') out.push(...changedPaths(av, bv, path));
    else if (String(av) !== String(bv)) out.push(path);
  }
  return out;
}

function intError(value, min, max) {
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isInteger(n)) return 'Whole number required';
  if (n < min || n > max) return `Between ${min} and ${max}`;
  return null;
}

function validate(cfg) {
  if (!cfg) return {};
  const e = {};
  const lev = intError(cfg.trading.maxLeverage, 1, 125);
  if (lev) e['trading.maxLeverage'] = lev;
  const bulkLev = intError(cfg.trading.bulk.maxLeverage, 1, 125);
  if (bulkLev) e['trading.bulk.maxLeverage'] = bulkLev;
  const minC = intError(cfg.trading.bulk.minCoins, 1, 10);
  if (minC) e['trading.bulk.minCoins'] = minC;
  const maxC = intError(cfg.trading.bulk.maxCoins, 1, 10);
  if (maxC) e['trading.bulk.maxCoins'] = maxC;
  if (!minC && !maxC && Number(cfg.trading.bulk.minCoins) > Number(cfg.trading.bulk.maxCoins)) {
    e['trading.bulk.minCoins'] = 'Cannot exceed the maximum';
  }
  if (!cfg.brand.name.trim()) e['brand.name'] = 'Required';
  if (cfg.announcement.enabled && !cfg.announcement.message.trim()) e['announcement.message'] = 'Write a message or turn the banner off';
  return e;
}

export default function AdminFeaturesPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/config');
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const cfg = draft ?? data;
  const changes = useMemo(() => (draft && data ? changedPaths(data, draft) : []), [draft, data]);
  const errors = useMemo(() => validate(cfg), [cfg]);
  const hasErrors = Object.keys(errors).length > 0;

  const update = (path, value) => setDraft((d) => setIn(structuredClone(d ?? data), path, value));

  const toggleMaintenance = async (on) => {
    if (on) {
      const ok = await confirm({
        tone: 'danger',
        title: 'Turn on maintenance mode?',
        description: 'After you save, every dashboard page shows the maintenance screen and new entries are rejected. Open positions and server-side baskets keep running.',
        confirmLabel: 'Turn on',
      });
      if (!ok) return;
    }
    update('maintenance.enabled', on);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminRequest('/api/admin/config', { method: 'PUT', body: draft });
      await refetch();
      setDraft(null);
      notify({ level: 'success', title: 'Configuration saved', message: 'Open dashboards apply it within a minute or on next focus.' });
    } catch (err) {
      notify({ level: 'danger', title: 'Not saved', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const banner = cfg ? BANNER[cfg.announcement.tone] || BANNER.info : null;
  const BannerIcon = banner?.icon;

  return (
    <Page width="medium">
      <PageHeader
        title="Features"
        description={data?.updatedAt ? `Last changed ${dateTime(data.updatedAt)}.` : 'What users can do and see in the dashboard.'}
      />

      {error && <Callout tone="danger" title="Could not load configuration" className="mb-4">{error}</Callout>}

      {loading && !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : cfg ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Trading" description="Enforced by the server on every order request, not only in the UI." />
            <CardBody className="space-y-5">
              <Switch
                label="Accept new entries"
                description="When off, opening positions is rejected. Closing positions, editing stops and emergency exits keep working."
                checked={cfg.trading.enabled}
                onChange={(v) => update('trading.enabled', v)}
                tone="pos"
              />
              <Switch
                label="Limit orders"
                description="Allow limit entries and limit closes in addition to market orders."
                checked={cfg.trading.limitOrdersEnabled}
                onChange={(v) => update('trading.limitOrdersEnabled', v)}
              />
              <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                <Field label="Leverage cap" hint="Highest leverage accepted on a single order." error={errors['trading.maxLeverage']}>
                  {(id) => (
                    <Input id={id} type="number" min={1} max={125} step={1} suffix="x" className="num"
                      value={cfg.trading.maxLeverage} onChange={(e) => update('trading.maxLeverage', e.target.value)} />
                  )}
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Bulk scalp" description="Multi-coin baskets opened from the Bulk scalp page." />
            <CardBody className="space-y-5">
              <Switch
                label="Allow bulk baskets"
                description="When off, the server rejects new baskets. Existing baskets can still be closed."
                checked={cfg.trading.bulk.enabled}
                onChange={(v) => update('trading.bulk.enabled', v)}
              />
              <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-3">
                <Field label="Minimum coins" error={errors['trading.bulk.minCoins']}>
                  {(id) => (
                    <Input id={id} type="number" min={1} max={10} step={1} className="num"
                      value={cfg.trading.bulk.minCoins} onChange={(e) => update('trading.bulk.minCoins', e.target.value)} />
                  )}
                </Field>
                <Field label="Maximum coins" error={errors['trading.bulk.maxCoins']}>
                  {(id) => (
                    <Input id={id} type="number" min={1} max={10} step={1} className="num"
                      value={cfg.trading.bulk.maxCoins} onChange={(e) => update('trading.bulk.maxCoins', e.target.value)} />
                  )}
                </Field>
                <Field label="Leverage cap" error={errors['trading.bulk.maxLeverage']}>
                  {(id) => (
                    <Input id={id} type="number" min={1} max={125} step={1} suffix="x" className="num"
                      value={cfg.trading.bulk.maxLeverage} onChange={(e) => update('trading.bulk.maxLeverage', e.target.value)} />
                  )}
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pages" description="Hidden pages disappear from the navigation and show a notice if opened directly." />
            <div className="divide-y divide-line">
              {FEATURE_PAGES.map((p) => (
                <div key={p.key} className="px-4 py-3">
                  <Switch
                    label={p.label}
                    description={<span className="num">{p.href}</span>}
                    checked={cfg.features[p.key]}
                    onChange={(v) => update(`features.${p.key}`, v)}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Announcement" description="A banner across the top of every dashboard page." />
            <CardBody className="space-y-5">
              <Switch
                label="Show announcement"
                checked={cfg.announcement.enabled}
                onChange={(v) => update('announcement.enabled', v)}
              />
              <Field label="Tone">
                {() => (
                  <Segmented
                    ariaLabel="Announcement tone"
                    options={[{ value: 'info', label: 'Info' }, { value: 'warn', label: 'Warning' }, { value: 'danger', label: 'Critical' }]}
                    value={cfg.announcement.tone}
                    onChange={(v) => update('announcement.tone', v)}
                  />
                )}
              </Field>
              <Field
                label="Message"
                aside={<span className="num">{cfg.announcement.message.length}/{MESSAGE_MAX}</span>}
                error={errors['announcement.message']}
              >
                {(id) => (
                  <Textarea id={id} maxLength={MESSAGE_MAX} rows={2} value={cfg.announcement.message}
                    onChange={(e) => update('announcement.message', e.target.value)} placeholder="For example: Binance maintenance at 06:00 UTC, expect delays." />
                )}
              </Field>
              {cfg.announcement.message.trim() && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-fg-muted">Preview</p>
                  <div className={cn('flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] text-fg', banner.cls, !cfg.announcement.enabled && 'opacity-50')}>
                    <BannerIcon size={15} className={cn('shrink-0', banner.iconCls)} />
                    <p className="min-w-0">{cfg.announcement.message}</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className={cn(cfg.maintenance.enabled && 'border-neg/40')}>
            <CardHeader title="Maintenance mode" description="Replaces the whole dashboard with a notice. The admin panel stays available." />
            <CardBody className="space-y-5">
              <Switch
                label="Maintenance mode"
                description="New entries are rejected while it is on. Open positions, stops and server-side baskets keep running."
                checked={cfg.maintenance.enabled}
                onChange={toggleMaintenance}
                tone="neg"
              />
              <Field label="Message" aside={<span className="num">{cfg.maintenance.message.length}/{MESSAGE_MAX}</span>}>
                {(id) => (
                  <Textarea id={id} maxLength={MESSAGE_MAX} rows={2} value={cfg.maintenance.message}
                    onChange={(e) => update('maintenance.message', e.target.value)} />
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Branding" />
            <CardBody>
              <Field label="App name" hint="Shown in the sidebar, browser tab and sign-in page." error={errors['brand.name']} className="max-w-xs">
                {(id) => (
                  <Input id={id} maxLength={24} value={cfg.brand.name} onChange={(e) => update('brand.name', e.target.value)} />
                )}
              </Field>
            </CardBody>
          </Card>

          <SaveBar
            visible={changes.length > 0}
            count={changes.length}
            saving={saving}
            disabled={hasErrors}
            message={hasErrors ? 'Fix the highlighted fields to save.' : undefined}
            onSave={save}
            onDiscard={() => setDraft(null)}
          />
        </div>
      ) : null}
    </Page>
  );
}
