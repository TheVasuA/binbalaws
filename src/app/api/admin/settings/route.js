import { NextResponse } from 'next/server';
import { requireAdmin, clientIp } from '@/lib/admin-guard';
import { getPortfolioSettings } from '@/lib/app-config';
import { redis, KEYS } from '@/lib/redis';
import { DEFAULT_SETTINGS, SETTINGS_FIELDS, validateSettings } from '@/lib/settings-schema';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await getPortfolioSettings());
}

export async function PUT(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const current = await getPortfolioSettings();
  const { values, errors } = validateSettings({ ...current, ...body });
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Some values are out of range.', fields: errors }, { status: 400 });
  }

  const next = { ...current, ...values, updatedAt: new Date().toISOString() };
  await redis.set(KEYS.settings, next);

  const changed = SETTINGS_FIELDS
    .filter((f) => current[f.key] !== next[f.key])
    .map((f) => `${f.key}: ${current[f.key]} → ${next[f.key]}`);
  if (changed.length) {
    await recordAudit({ action: 'settings.update', detail: changed.join('; '), ip: clientIp(request) });
  }
  return NextResponse.json(next);
}

export async function DELETE(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  await redis.del(KEYS.settings);
  await recordAudit({ action: 'settings.reset', ip: clientIp(request) });
  return NextResponse.json(DEFAULT_SETTINGS);
}
