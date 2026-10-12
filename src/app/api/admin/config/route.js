import { NextResponse } from 'next/server';
import { requireAdmin, clientIp } from '@/lib/admin-guard';
import { getAppConfig, saveAppConfig } from '@/lib/app-config';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await getAppConfig({ fresh: true }));
}

export async function PUT(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const patch = await request.json();
    const before = await getAppConfig({ fresh: true });
    const next = await saveAppConfig(patch);
    await recordAudit({ action: 'config.update', detail: diff(before, next), ip: clientIp(request) });
    return NextResponse.json(next);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Flat list of "path: old → new" changes for the audit trail.
function diff(a, b, prefix = '') {
  const changes = [];
  for (const key of Object.keys(b)) {
    if (key === 'updatedAt') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const av = a?.[key];
    const bv = b[key];
    if (bv && typeof bv === 'object' && !Array.isArray(bv)) {
      changes.push(...diff(av, bv, path));
    } else if (av !== bv) {
      changes.push(`${path}: ${JSON.stringify(av)} → ${JSON.stringify(bv)}`);
    }
  }
  return prefix ? changes : changes.join('; ') || 'no changes';
}
