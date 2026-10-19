import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { listAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const limit = Number(request.nextUrl.searchParams.get('limit')) || 200;
  try {
    return NextResponse.json(await listAudit(limit));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
