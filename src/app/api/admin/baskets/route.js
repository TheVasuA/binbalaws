import { NextResponse } from 'next/server';
import { requireAdmin, clientIp } from '@/lib/admin-guard';
import { listActiveBaskets, updateBasket, removeBasket, readWatcherHeartbeat } from '@/lib/bulk-basket-db';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const [baskets, heartbeat] = await Promise.all([listActiveBaskets(), readWatcherHeartbeat()]);
    return NextResponse.json({ baskets, heartbeat });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, armed, targetUsdt, stopUsdt } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch = {};
  if (typeof armed === 'boolean') patch.armed = armed;
  if (targetUsdt !== undefined) patch.targetUsdt = targetUsdt;
  if (stopUsdt !== undefined) patch.stopUsdt = stopUsdt;

  const updated = await updateBasket(id, patch);
  if (!updated) return NextResponse.json({ error: 'Basket not found' }, { status: 404 });
  await recordAudit({ action: 'basket.update', detail: `${id.slice(0, 8)} ${JSON.stringify(patch)}`, ip: clientIp(request) });
  return NextResponse.json(updated);
}

export async function DELETE(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await removeBasket(id);
  await recordAudit({ action: 'basket.remove', detail: id.slice(0, 8), ip: clientIp(request) });
  return NextResponse.json({ ok: true });
}
