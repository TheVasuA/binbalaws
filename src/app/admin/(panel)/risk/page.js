'use client';

import { useMemo, useState } from 'react';
import {
  Button, Callout, Card, CardBody, CardHeader, Field, Input, Page, PageHeader, Skeleton, Switch, useConfirm,
} from '@/components/ui';
import { IconUndo } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { useNotify } from '@/lib/notify';
import { dateTime } from '@/lib/format';
import { SETTINGS_FIELDS, SETTINGS_GROUPS, DEFAULT_SETTINGS, validateSettings } from '@/lib/settings-schema';
import { adminRequest } from '@/components/admin/admin-api';
import { SaveBar } from '@/components/admin/save-bar';

const GROUP_HELP = {
  goal: 'Drives the compound ladder on the Goal page and the daily profit target.',
  orders: 'Defaults and warnings on the order ticket.',
  limits: 'Daily loss controls enforced by the server on every new entry.',
  display: 'Presentation only.',
};

const sameValue = (a, b) => String(a ?? '') === String(b ?? '');

export default function AdminRiskPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/settings');
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [draft, setDraft] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const value = (key) => (key in draft ? draft[key] : data?.[key]);
  const changed = useMemo(
    () => (data ? Object.keys(draft).filter((k) => !sameValue(draft[k], data[k])) : []),
    [draft, data],
  );
  const errors = useMemo(() => {
    const result = validateSettings({ ...data, ...draft }).errors;
    for (const [key, v] of Object.entries(draft)) {
      if (String(v).trim() === '') result[key] = 'Required';
    }
    return result;
  }, [data, draft]);
  const fieldError = (key) => errors[key] || serverErrors[key];

  const set = (key, v) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setServerErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, draft[k]]));
      await adminRequest('/api/admin/settings', { method: 'PUT', body: patch });
      await refetch();
      setDraft({});
      notify({ level: 'success', title: 'Risk limits saved', message: `${changed.length} setting${changed.length === 1 ? '' : 's'} updated. Open dashboards pick this up within a minute.` });
    } catch (err) {
      if (err.fields) setServerErrors(err.fields);
      notify({ level: 'danger', title: 'Not saved', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    const ok = await confirm({
      tone: 'danger',
      title: 'Restore default limits?',
      description: 'Every risk and goal setting returns to its default value. This is recorded in the audit log.',
      confirmLabel: 'Restore defaults',
    });
    if (!ok) return;
    try {
      await adminRequest('/api/admin/settings', { method: 'DELETE' });
      await refetch();
      setDraft({});
      notify({ level: 'success', title: 'Defaults restored' });
    } catch (err) {
      notify({ level: 'danger', title: 'Reset failed', message: err.message });
    }
  };

  return (
    <Page width="medium">
      <PageHeader
        title="Risk limits"
        description={data?.updatedAt ? `Last changed ${dateTime(data.updatedAt)}.` : 'Loss limits, leverage defaults and goal settings for every device.'}
        actions={
          <Button variant="secondary" size="sm" onClick={resetAll} disabled={!data}>
            <IconUndo size={14} />
            Restore defaults
          </Button>
        }
      />

      {error && <Callout tone="danger" title="Could not load settings" className="mb-4">{error}</Callout>}

      {loading && !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : data ? (
        <div className="space-y-4">
          {SETTINGS_GROUPS.map((group) => {
            const fields = SETTINGS_FIELDS.filter((f) => f.group === group.id);
            const toggles = fields.filter((f) => f.type === 'boolean');
            const numbers = fields.filter((f) => f.type !== 'boolean');
            return (
              <Card key={group.id}>
                <CardHeader title={group.label} description={GROUP_HELP[group.id]} />
                <CardBody className="space-y-5">
                  {numbers.length > 0 && (
                    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                      {numbers.map((f) => (
                        <Field
                          key={f.key}
                          label={f.unit.length > 3 ? <>{f.label} <span className="font-normal text-fg-subtle">({f.unit})</span></> : f.label}
                          aside={!sameValue(value(f.key), DEFAULT_SETTINGS[f.key]) ? `Default ${DEFAULT_SETTINGS[f.key]}` : undefined}
                          hint={f.help}
                          error={fieldError(f.key)}
                        >
                          {(id) => (
                            <Input
                              id={id}
                              type="number"
                              inputMode="decimal"
                              min={f.min}
                              max={f.max}
                              step={f.step}
                              suffix={f.unit.length > 3 ? undefined : f.unit}
                              value={value(f.key) ?? ''}
                              onChange={(e) => set(f.key, e.target.value)}
                              aria-invalid={!!fieldError(f.key)}
                              className="num"
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  )}
                  {toggles.length > 0 && (
                    <div className="space-y-4 border-t border-line pt-5 first:border-0 first:pt-0">
                      {toggles.map((f) => (
                        <Switch
                          key={f.key}
                          label={f.label}
                          description={f.help}
                          checked={Number(value(f.key)) === 1}
                          onChange={(on) => set(f.key, on ? 1 : 0)}
                          tone={f.key === 'allowOrdersAfterBreach' ? 'neg' : 'accent'}
                        />
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}

          <SaveBar
            visible={changed.length > 0}
            count={changed.length}
            saving={saving}
            disabled={Object.keys(errors).length > 0}
            message={Object.keys(errors).length ? 'Fix the highlighted fields to save.' : undefined}
            onSave={save}
            onDiscard={() => { setDraft({}); setServerErrors({}); }}
          />
        </div>
      ) : null}
    </Page>
  );
}
